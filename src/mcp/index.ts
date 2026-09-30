import os from 'node:os';
import { callBridge, defaultSocketPath } from './bridge-client';
import { serveMcp } from './mcp-server';

// Servidor MCP de Ritmo: `node out/main/mcp.js`. La salida estándar solo lleva mensajes del protocolo.
const socketPath = defaultSocketPath(process.env, os.homedir());
serveMcp(process.stdin, process.stdout, request => callBridge(socketPath, request)).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
