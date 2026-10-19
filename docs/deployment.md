# Deployment

BambooLeaf deploys as two services: the Express API on Render and the Vite frontend on Vercel. The API requires a persistent MongoDB database; it does not run with an in-memory database.

## Deploy the API to Render

1. Create a new **Blueprint** in Render connected to this repository. Render reads the root `render.yaml`; it creates a Node web service using `backend` as its root directory.
2. Set the Blueprint's prompted environment variables:
   - `MONGODB_URI`: MongoDB connection string. Ensure the database allows connections from Render.
   - `MONGODB_DB_NAME`: database name.
   - `FRONTEND_ORIGIN`: the Vercel frontend origin, `https://bamboo-leaf.vercel.app` (no path or trailing slash). The Render Blueprint sets this value; if you manage the service outside the Blueprint, set it in the Render dashboard. Separate multiple allowed origins with commas.
3. Add any application-specific secrets or settings your deployment needs in the Render service's environment settings. For example, configure `RPC_URL`, `CHAIN_ID`, and `AGENT_KEY` only when enabling blockchain operations, and configure provider API keys if using an LLM provider. Keep private keys and API keys in Render, never in the frontend.
4. After deployment, verify the service's `/health` endpoint returns `{"status":"ok"}`.

The Blueprint uses `npm ci` in `backend` and starts the API with `npm start`. Render supplies `PORT`; the service listens on `0.0.0.0`. `TRUST_PROXY_HOPS=1` trusts Render's single proxy hop for client IP handling.

## Deploy the frontend to Vercel

1. Import the repository into Vercel and set the project **Root Directory** to `frontend`.
2. The checked-in `frontend/vercel.json` configures the Vite build (`npm run build`) and its `dist` output directory.
3. In the Vercel project's environment variables, set `VITE_API_BASE_URL` to the deployed Render API URL plus `/api`. For the current Render service, use `https://bambooleaf.onrender.com/api`. Add it to each environment you deploy (Production, Preview, or Development). Vite embeds this value at build time, so redeploy after changing it.
4. Deploy, then set Render's `FRONTEND_ORIGIN` to the deployed Vercel origin (and any preview origin you intend to allow).

## Local development

The example env files use local defaults. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`; configure MongoDB and any optional provider/chain settings before starting the API.
