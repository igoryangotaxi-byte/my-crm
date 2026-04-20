Appli Taxi Oz CRM built with Next.js App Router, TypeScript and Tailwind CSS.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create local env file from template:

```bash
cp .env.example .env.local
```

3. Fill the Yango API tokens in `.env.local`:

```env
YANGO_TOKEN_SAMELET=
YANGO_TOKEN_SHUFERSAL=
YANGO_TOKEN_APLI_TAXI_OZ=
YANGO_TOKEN_RYDEMOBILITY=
```

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Security

- Never commit `.env.local` or real API tokens.
- If tokens were previously in git history, rotate them in Yango before publishing repository.

## Deploy

Deploy with Vercel: [https://vercel.com/new](https://vercel.com/new)
