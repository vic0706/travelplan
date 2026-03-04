# Travel Plan App

## Deployment

This project uses Cloudflare Workers for deployment.

### Prerequisites

- Node.js installed
- Wrangler installed (`npm install -g wrangler`)
- Logged in to Cloudflare (`wrangler login`)

### How to Deploy

To deploy the application, run:

```bash
npm run deploy
```

This command will automatically:
1. Build the frontend (`npm run build`)
2. Deploy the worker (`wrangler deploy`)

**Important:** Do not run `wrangler deploy` directly without building first, as this may result in missing static assets and a "Manifest missing" error.

### Troubleshooting

If you encounter a "Manifest missing" error:
1. Ensure you have run `npm run build`.
2. Check that the `dist` directory exists and contains `index.html`.
3. Redeploy using `npm run deploy`.

You can also check the worker health at:
`https://<your-worker-subdomain>.workers.dev/health-check`
