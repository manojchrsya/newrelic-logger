/**
 * Comprehensive benchmark.
 *
 * Measures performance across multiple locales with various number types:
 * - Small, medium, and large integers
 * - Currency conversion
 * - BigInt values (including beyond MAX_SAFE_INTEGER)
 *
 * Vitest 5 runs benchmarks through the `bench` test-context fixture: each group is one `test()`
 * whose benchmarks are compared with `bench.compare()`. Run with `npm run bench`.
 */