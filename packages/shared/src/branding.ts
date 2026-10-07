/**
 * Product name of this fork. Single owner for user-visible and outbound identity.
 * Spec: specs/self-hosted-build/branding.md. The desktop build identity
 * (packages/desktop/scripts/desktop-product-identity.mjs) mirrors this value; a policy
 * test keeps them equal.
 */
export const PRODUCT_DISPLAY_NAME = "ZCode Beyond";

/** GitHub repository (owner/name) that publishes this fork's builds. */
export const PRODUCT_GITHUB_REPOSITORY = "cguldogan/ZCode";

/** Public home of this fork, used where the app identifies itself to other services. */
export const PRODUCT_HOMEPAGE_URL = `https://github.com/${PRODUCT_GITHUB_REPOSITORY}`;
