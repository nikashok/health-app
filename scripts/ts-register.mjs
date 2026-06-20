// Registers the extensionless-TS resolve hook for node --import. See ts-resolve-hook.mjs.
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
