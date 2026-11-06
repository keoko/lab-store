import { readFile } from 'node:fs/promises';
import { parseLanguageRows } from '../../scripts/languages.js';

export const LANGUAGE_SHEET = JSON.parse(await readFile(new URL('../../content/placeholders/languages.json', import.meta.url), 'utf8'));
export const LANGUAGES = parseLanguageRows(LANGUAGE_SHEET.data.data);
