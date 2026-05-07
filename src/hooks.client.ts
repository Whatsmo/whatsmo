import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event }) => {
	const message = error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : undefined;

	console.error('[Whatsmo] Unhandled error:', { message, stack, url: event.url.pathname });

	return {
		message: 'Something went wrong',
		code: 'UNEXPECTED'
	};
};
