import {ProductAdministrativeActionBuilder, ProductUpdateBuilder, ProductVariantBuilder, Integrator} from "@relewise/integrations";
import {DataValueFactory} from "@relewise/client";

// NOTE: Relewise API keys etc. are hardcoded here for simplicity, but they should be moved to wrangler.toml
//       and handled as environment variables - see the usage of UMBRACO_HOST below for inspiration
const integrator = new Integrator('[your dataset ID]', '[your api key]', {serverUrl: '[your dataset server URL]'});
const english = 'en';
const eur = 'eur';

export default {
	async fetch(request, env, ctx) {
		if (request.method !== 'POST') {
			return new Response('Expected a POST request', {
				status: 405,
			});
		}

		const event = request.headers.get('umb-webhook-event');
		const json = await request.json();

		switch (event) {
			case 'Umbraco.ContentPublish':
				return await handlePublish(json, env.UMBRACO_HOST);
			case 'Umbraco.ContentUnpublish':
				return await handleUnpublish(json);
			default:
				return new Response(`Unable to handle event: ${event}`, {
					status: 400,
				});
		}
	},
};

async function handlePublish(json, umbracoHost) {
	// the publish webhook payload does not contain product variant data,
	// so let's fetch the entire product including its variants
	const umbracoId = json.Id;
	const response = await fetch(
		`${umbracoHost}/umbraco/delivery/api/v2/content/item/${umbracoId}?expand=properties[variants]`
	);
	json = await response.json();

	// make sure it is indeed a product before parsing it
	const contentType = json.contentType;
	if (contentType !== 'product') {
		return new Response(`Unable to handle content type: ${contentType}`, {
			status: 400,
		});
	}

	// helper method: removes all HTML tags and newlines from a RichText value
	const sanitizeRichText = (richTextValue) => richTextValue.markup
		.replace(/<[^>]*>?/gm, '')
		.replace(/\n/gm, ' ');

	// create a "product update" instruction for Relewise
	const productUpdate = new ProductUpdateBuilder({
		id: json.properties.sku,
		productUpdateKind: 'ClearAndReplace',
		variantUpdateKind: 'ClearAndReplace',
		replaceExistingVariants: true
	}).displayName([
		{language: english, value: json.name},
	]).data({
		// these are the data points that should be used for search and recommendation
		'Path': DataValueFactory.string(json.route.path),
		'ShortDescription': DataValueFactory.multilingual([
			{
				language: english,
				value: json.properties.shortDescription
			}
		]),
		'LongDescription': DataValueFactory.multilingual([
			{
				language: english,
				value: sanitizeRichText(json.properties.longDescription)
			}
		]),
		'Tags': DataValueFactory.stringCollection(json.properties.tags),
		// these data points are for sorting (unix timestamps)
		'CreateDate': DataValueFactory.number(new Date(json.createDate).getTime()),
		'UpdateDate': DataValueFactory.number(new Date(json.updateDate).getTime()),
		// these data points "just" needs storing in the search index for future use
		'MainImage': DataValueFactory.string(`${umbracoHost}${json.properties.images[0].url}`),
		'UmbracoId': DataValueFactory.string(umbracoId)
	});

	// extract the variants (if there are any) - this includes sales price per variant
	const variants = extractVariants(json);
	if (variants.length) {
		productUpdate.variants(variants);
	} else {
		// no variants - set the sales price on the product itself
		const price = [{
			currency: eur,
			amount: json.properties.price.withTax
		}];
		productUpdate
			.listPrice(price)
			.salesPrice(price);
	}

	// execute the product update
	await integrator.updateProduct(productUpdate.build());

	return new Response();
}

async function handleUnpublish(json) {
	const umbracoId = json.Id;

	// create a "disable product" instruction for Relewise (using a data filter by Umbraco ID)
	const disableProduct = new ProductAdministrativeActionBuilder({
		language: null,
		currency: null,
		filters(filterBuilder) {
			filterBuilder.addProductDataFilter(
				'UmbracoId',
				(conditionBuilder) => conditionBuilder.addEqualsCondition(
					DataValueFactory.string(umbracoId)
				)
			);
		},
		productUpdateKind: 'Disable',
	});

	// execute the instruction
	await integrator.executeProductAdministrativeAction(disableProduct.build())

	return new Response();
}

function extractVariants(json) {
	const variants = json.properties.variants;
	const items = variants?.items;
	const attributes = variants?.attributes;

	if (!items || !items.length || !attributes) {
		return [];
	}

	// map variant items and their attributes to the Relewise ProductVariant format
	return items.map((item) => {
		let data = {};
		Object.entries(item.attributes).forEach(([attributeAlias, attributeValueAlias]) => {
			const attribute = attributes.find((attr) => attr.alias === attributeAlias);
			if (!attribute) {
				return;
			}

			const attributeValue = attribute.values.find((value) => value.alias === attributeValueAlias);
			if (!attributeValue) {
				return;
			}

			data[attribute.name] = DataValueFactory.multilingualCollection([
				{
					language: english,
					values: [attributeValue.name]
				}
			]);
		});

		const price = [{
			currency: eur,
			amount: item.content.properties.price.withTax
		}];
		return new ProductVariantBuilder({id: item.content.properties.sku})
			.data(data)
			.listPrice(price)
			.salesPrice(price)
			.build();
	});
}
