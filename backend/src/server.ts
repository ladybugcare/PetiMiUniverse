// backend/src/server.ts
import http from 'http';
import app from './app';

const explicitPort = process.env.PORT;
const isProd = process.env.NODE_ENV === 'production';

/** Em dev, 3001 costuma ser o React; tentamos 3000 e depois 3002+ */
const DEV_FALLBACK_PORTS = [3000, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

function portForAttempt(attemptIndex: number): number {
  if (explicitPort) {
    const n = Number(explicitPort);
    return Number.isFinite(n) && n > 0 ? n : 3000;
  }
  if (isProd) {
    return 3000;
  }
  return DEV_FALLBACK_PORTS[attemptIndex] ?? 3010 + (attemptIndex - DEV_FALLBACK_PORTS.length + 1);
}

function start(attemptIndex: number) {
  const port = portForAttempt(attemptIndex);

  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`🐾 Server running on port ${port}`);
    if (!explicitPort && !isProd && port !== 3000) {
      console.warn(
        `⚠️  Porta 3000 ocupada — API em http://localhost:${port}. Defina REACT_APP_API_URL (frontend) para o mesmo host/porta.`
      );
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') {
      console.error(err);
      process.exit(1);
    }

    if (explicitPort || isProd) {
      console.error(`\n❌ Porta ${port} já em uso (EADDRINUSE).`);
      if (explicitPort) {
        console.error('   Ajuste PORT no .env ou liberte a porta, por exemplo:');
      } else {
        console.error('   Liberte a porta ou defina PORT no ambiente, por exemplo:');
      }
      console.error(`   lsof -i tcp:${port}`);
      console.error('   npm run dev:clean   (mata processo na 3000 e arranca de novo)\n');
      process.exit(1);
    }

    const next = attemptIndex + 1;
    if (next > 25) {
      console.error('❌ Não foi possível encontrar uma porta livre (tentativas esgotadas).');
      process.exit(1);
    }

    console.warn(`⚠️  Porta ${port} ocupada, a tentar ${portForAttempt(next)}...`);
    start(next);
  });
}

start(0);
