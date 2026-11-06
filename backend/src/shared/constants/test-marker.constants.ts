// src/shared/constants/test-marker.constants.ts

/**
 * The header the admin's playgrounds send to mark a request as the admin testing. On its
 * own it proves nothing: the server counts a request as a test only with the admin's
 * login too (see markIfAdminTest). Here, with no imports, so client code can send it.
 */
export const TEST_MARKER_HEADER = 'x-interakt-test';
