import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { createServer } from 'http-proxy';
import { IncomingMessage, ServerResponse } from 'http';
import moment from 'moment';
import { BaseEncodingOptions } from 'node:fs';
import dotenv from 'dotenv';

console.log('App is started');
const ROOT_DIRECTORY = path.resolve(__dirname, '..');

const envFile = path.join(ROOT_DIRECTORY, '.env');
dotenv.config({
  path: envFile,
});
const { HTTP_TARGET, HTTPS_TARGET, HANDLE_ALL_REQUESTS } = process.env;
console.log(`Handle all requests ${!!HANDLE_ALL_REQUESTS}`);

const SSL_DIRECTORY = path.join(ROOT_DIRECTORY, 'ssl');
const SSL_KEY_PATH = path.join(SSL_DIRECTORY, 'ssl_key.pem');
const SSL_CERT_PATH = path.join(SSL_DIRECTORY, 'ssl_cert.pem');

const HTTP_PORT = process.env.HTTP_PORT
  ? Number.parseInt(process.env.HTTP_PORT)
  : 80;
const HTTPS_PORT = process.env.HTTPS_PORT
  ? Number.parseInt(process.env.HTTPS_PORT)
  : 443;

const http_proxy = createServer({
  target: HTTP_TARGET,
  selfHandleResponse: true,
});

http_proxy.listen(HTTP_PORT);
console.log(`HTTP is running on ${HTTP_PORT}`);

const https_proxy = createServer({
  ssl: {
    key: fs.readFileSync(SSL_KEY_PATH, 'utf8'),
    cert: fs.readFileSync(SSL_CERT_PATH, 'utf8'),
  },
  target: HTTPS_TARGET,
  secure: false,
  selfHandleResponse: true,
});

console.log(`App is running on ${HTTPS_PORT}`);
https_proxy.listen(HTTPS_PORT);

function proxyErrorHandler(
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
) {
  console.error(err);
  res.writeHead(500, {
    'Content-Type': 'text/plain',
  });

  res.end('Something went wrong. And we are reporting a custom error message.');
}

http_proxy.on('error', proxyErrorHandler);
https_proxy.on('error', proxyErrorHandler);

const LOGS_DIRECTORY = path.join(ROOT_DIRECTORY, 'logs');

const checkUserAgent = (userAgent: string | undefined): boolean => {
  console.log(`User agent: ${userAgent}`);
  if (HANDLE_ALL_REQUESTS) {
    return true;
  }
  if (!userAgent) {
    return false;
  }
  const normUserAgent = userAgent.toLowerCase();
  return normUserAgent.includes('googlebot');
};

function handleResponse(
  proxyRes: IncomingMessage,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const body: Buffer[] = [];
  console.log(`Processing response.`);
  proxyRes.on('data', (chunk) => {
    console.log(`Data chunk`);
    body.push(chunk);
  });
  proxyRes.on('end', async () => {
    const userAgent = req.headers['user-agent'];
    if (checkUserAgent(userAgent)) {
      console.log(`Saving response for bot`);
      const requestHeadersString = JSON.stringify(req.headers);
      const responseHeadersString = JSON.stringify(proxyRes.headers);
      const timestamp = moment().format('YYYY-MM-DD-HH-mm-ss');
      const responseFile = path.join(
        LOGS_DIRECTORY,
        `response-${timestamp}.log`,
      );
      const responseHeadersFile = path.join(
        LOGS_DIRECTORY,
        `response-headers-${timestamp}.json`,
      );
      const requestHeadersFile = path.join(
        LOGS_DIRECTORY,
        `request-headers-${timestamp}.json`,
      );
      const fsOptions: BaseEncodingOptions = {
        encoding: 'utf-8',
      };
      await Promise.all([
        fsPromises.writeFile(responseFile, Buffer.concat(body)),
        fsPromises.writeFile(
          responseHeadersFile,
          responseHeadersString,
          fsOptions,
        ),
        fsPromises.writeFile(
          requestHeadersFile,
          requestHeadersString,
          fsOptions,
        ),
      ]);
    }
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      res.setHeader(key, value);
    }
    res.end(Buffer.concat(body));
  });
}

http_proxy.on('proxyRes', handleResponse);
https_proxy.on('proxyRes', handleResponse);
