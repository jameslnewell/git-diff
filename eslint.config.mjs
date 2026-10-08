import {defineConfig, globalIgnores} from 'eslint/config';
import config from '@jameslnewell/eslint-config/node';

export default defineConfig([globalIgnores(['dist']), config]);
