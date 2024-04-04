# Umbraco Commerce + Relewise
This repo contains a demo integrating Umbraco with an external system without writing any .NET code, using Cloudflare Workers as the integration layer.

In the demo, [Umbraco Commerce](https://umbraco.com/products/add-ons/commerce/) products will be pushed to [Relewise](https://relewise.com) using Umbraco Webhooks, Content Delivery API and the Relewise JavaScript SDK.

Read all about it on [my blog](https://kjac.dev/posts/umbraco-to-relewise-with-workers/).

## Running the demo

The demo consists of two projects - an Umbraco CMS project and a Cloudflare Worker project - `src/Cms` and `src/Worker` respectively.

You’ll need .NET 8 to run the CMS project. To start it, open a terminal window in `src/Cms` and run:

```bash
dotnet run
```

The CMS must be running for the Worker to work. To start the Worker, open a terminal window in `src/Worker` and run:

```bash
npm install
npm run start
```

Check the above-mentioned blog post for details on how the two projects work together. 

## Umbraco

The Umbraco database is bundled up as part of the GitHub repo.

You'll need to login to play around with the Umbraco content. The administrator login for Umbraco is:

- Username: admin@localhost
- Password: SuperSecret123
