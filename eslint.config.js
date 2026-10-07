import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		ignores: [
			'dist/',
			'.svelte-kit/',
			'node_modules/',
			'coverage/',
			'playwright-report/',
			'test-results/'
		]
	},
	{
		rules: {
			// Allow unused vars prefixed with underscore
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
			'svelte/no-at-html-tags': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			// Allow $state + $effect pattern when state needs both reactive sync AND manual updates
			'svelte/prefer-writable-derived': 'off'
		}
	}
);
