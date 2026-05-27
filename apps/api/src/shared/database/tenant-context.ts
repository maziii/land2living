// Slug must be lowercase alphanumeric + underscores (e.g. "ndebele", "royal_council").
// No hyphens — keeps schema names clean SQL identifiers without quoting.
const SLUG_RE = /^[a-z][a-z0-9_]*$/;

export class TenantContext {
  readonly slug: string;

  constructor(slug: string) {
    if (!SLUG_RE.test(slug)) {
      throw new Error(
        `Invalid tenant slug "${slug}". Must match [a-z][a-z0-9_]* (e.g. "ndebele").`,
      );
    }
    this.slug = slug;
  }

  /** PostgreSQL schema name for this tenant: tenant_<slug> */
  get schemaName(): string {
    return `tenant_${this.slug}`;
  }
}
