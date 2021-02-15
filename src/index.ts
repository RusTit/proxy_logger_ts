import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { createServer } from 'http-proxy';
import { IncomingMessage, ServerResponse } from 'http';
import moment from 'moment';
import { BaseEncodingOptions } from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();
const { TARGET, HANDLE_ALL_REQUEST } = process.env;

const ROOT_DIRECTORY = path.resolve(__dirname, '..');
const SSL_DIRECTORY = path.join(ROOT_DIRECTORY, 'ssl');
const SSL_KEY_PATH = path.join(SSL_DIRECTORY, 'ssl_key.pem');
const SSL_CERT_PATH = path.join(SSL_DIRECTORY, 'ssl_cert.pem');

const proxy = createServer({
  ssl: {
    key: fs.readFileSync(SSL_KEY_PATH, 'utf8'),
    cert: fs.readFileSync(SSL_CERT_PATH, 'utf8'),
  },
  target: TARGET,
  secure: true,
  selfHandleResponse: true,
});
proxy.listen(3000);

proxy.on(
  'error',
  function (err: Error, req: IncomingMessage, res: ServerResponse) {
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });

    res.end(
      'Something went wrong. And we are reporting a custom error message.',
    );
  },
);

const LOGS_DIRECTORY = path.join(ROOT_DIRECTORY, 'logs');

const checkUserAgent = (userAgent: string | undefined): boolean => {
  console.log(`User agent: ${userAgent}`);
  if (HANDLE_ALL_REQUEST) {
    return true;
  }
  if (!userAgent) {
    return false;
  }
  const normUserAgent = userAgent.toLowerCase();
  return normUserAgent.includes('googlebot');
};

proxy.on('proxyRes', function (proxyRes, req, res) {
  const body: any[] = [];
  console.log(`Processing response.`);
  proxyRes.on('data', (chunk) => {
    if (Array.isArray(chunk)) {
      body.push(...chunk);
    } else {
      body.push(chunk);
    }
  });
  proxyRes.on('end', async () => {
    const userAgent = req.headers['user-agent'];
    if (checkUserAgent(userAgent)) {
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
        fsPromises.writeFile(responseFile, Buffer.from(body)),
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
    res.end(body);
  });
});
