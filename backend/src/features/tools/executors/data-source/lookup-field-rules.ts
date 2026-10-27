// src/features/tools/executors/data-source/lookup-field-rules.ts

/**
 * Which fields name an item and which hold its code, for Find Record. One owner for the
 * field-name rules: the matcher (lookup.ts) uses them to work fields out when a tool has none
 * chosen, and tools.service uses them to suggest and check a tool's chosen fields.
 *
 * Pure: no services or database, so tools.service can use it without importing the executor.
 */

/** A tool's chosen fields (in its executorConfig). An empty or missing list means "work it out". */
export interface LookupFieldsConfig {
  nameFields?: string[];
  codeFields?: string[];
  /**
   * Hand-set before nameFields/codeFields existed: the field an external lookup filters on first.
   * It keeps doing only that (code detection stays on), so tools that set it work as before.
   */
  idField?: string;
}

/** What a picker and the checks know about a field of the tool's data source. */
export interface LookupFieldCandidate {
  name: string;
  type?: string;
  /** Matched by the search Find Record runs */
  searchable?: boolean;
  /** Can be filtered on exactly (how an external source fetches by code) */
  filterable?: boolean;
  /** A json/object field whose paths (variants.sku) can be chosen */
  hasPaths?: boolean;
  role?: string | null;
  /** Share of sampled records without a value, when known */
  nullRate?: number;
}

/** Fields that identify a record exactly: id, sku, productCode, item_number, ... */
export const IDENTIFIER_FIELD = /(^|_|-)(id|sku|code|key|slug|handle|number|ref|ean|upc|gtin|mpn)$|(Id|ID|Sku|SKU|Code|Key|Slug|Handle|Number|Ref)$/;
/**
 * Guessed name fields, for a record whose schema declares none: exact names, so colorName or
 * fileName don't count as the record's name.
 */
const NAME_FIELDS = new Set([
  'name', 'title', 'label', 'heading', 'displayname', 'productname', 'producttitle', 'itemname',
  'documenttitle', 'pagetitle',
]);
export const isNameField = (field: string) => NAME_FIELDS.has(field.toLowerCase().replace(/[_\-\s]/g, ''));
/** When a record has none of those: a field whose name ends in name or title (HotelName, itemTitle). */
export const LOOSE_NAME_FIELD = /(name|title)$/i;
/** Fields about a related item (brandName, categoryId, ...), which don't identify this record. */
const RELATED_WORDS = new Set([
  'brand', 'category', 'categories', 'vendor', 'manufacturer', 'supplier', 'seller', 'parent', 'collection',
  'store', 'author', 'related',
]);
/** Fields naming the record's brand, which a request often puts next to the name. */
const BRAND_WORDS = new Set(['brand', 'vendor', 'manufacturer']);
/**
 * Code fields worth suggesting: a stricter list than IDENTIFIER_FIELD, which also matches
 * attributes such as colorCode or countryCode.
 */
const SUGGESTED_CODE_FIELD = /(^|_|-)(id|sku|ean|upc|gtin|mpn|isbn|barcode)$|(Id|ID|Sku|SKU)$/;
const SUGGESTED_CODE_NAMES = new Set(['code', 'productcode', 'itemcode', 'partnumber', 'partno', 'productnumber', 'itemnumber']);

/**
 * A word without its plural ending, so "sweaters" and "sweater" compare equal. Words ending in
 * -ies, -y or -ie all end in "i", so "batteries" meets "battery" and "hoodies" meets "hoodie".
 */
export function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}i`;
  const one = word.endsWith('s') ? word.slice(0, -1) : word;
  return one.length > 3 ? one.replace(/([^aeiou])y$/, '$1i').replace(/ie$/, 'i') : one;
}

/** The words of a field name (storeName, parent_sku, Category-Id), so transparentCover isn't "parent". */
function fieldNameWords(field: string): string[] {
  return field
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);
}
const hasFieldWord = (field: string, words: Set<string>) =>
  fieldNameWords(field).some((word) => words.has(word) || words.has(singular(word)));
export const isRelatedField = (field: string) => hasFieldWord(field, RELATED_WORDS);
export const isBrandField = (field: string) => hasFieldWord(field, BRAND_WORDS);

const lastSegment = (field: string) => field.split('.').pop() ?? field;

/** The chosen lists, without empties and duplicates. */
export function chosenLookupFields(config: LookupFieldsConfig | undefined): { nameFields: string[]; codeFields: string[] } {
  const clean = (list: unknown) =>
    Array.isArray(list) ? [...new Set(list.filter((f): f is string => typeof f === 'string' && f.trim() !== ''))] : [];
  return { nameFields: clean(config?.nameFields), codeFields: clean(config?.codeFields) };
}

/** Whether a tool has any field chosen (a hand-set idField counts): it can then be added to an experience. */
export function hasChosenLookupFields(config: LookupFieldsConfig | undefined): boolean {
  const { nameFields, codeFields } = chosenLookupFields(config);
  return nameFields.length > 0 || codeFields.length > 0 || (typeof config?.idField === 'string' && config.idField !== '');
}

/**
 * Fields to suggest for a new or unconfigured Find Record tool: the name field (declared title
 * first, then a known name field, then one ending in name/title), and code fields that pass the
 * checks for this source. Suggestions are reviewed by the admin before they count.
 */
export function suggestLookupFields(
  candidates: LookupFieldCandidate[],
  rules: LookupFieldRules,
): { nameFields: string[]; codeFields: string[] } {
  const usable = candidates.filter((f) => f.type !== 'vector');
  const own = usable.filter((f) => !isRelatedField(f.name) && !IDENTIFIER_FIELD.test(f.name));
  const name =
    usable.find((f) => f.role === 'title') ??
    own.find((f) => isNameField(f.name)) ??
    own.find((f) => LOOSE_NAME_FIELD.test(f.name));
  const codeFields = usable
    .filter((f) => !isRelatedField(f.name))
    .filter((f) => f.role === 'id' || SUGGESTED_CODE_FIELD.test(lastSegment(f.name))
      || SUGGESTED_CODE_NAMES.has(lastSegment(f.name).toLowerCase().replace(/[_\-\s]/g, '')))
    .filter((f) => fits(f, 'code', rules))
    .map((f) => f.name)
    .slice(0, 3);
  return { nameFields: name && fits(name, 'name', rules) ? [name.name] : [], codeFields };
}

/** How a source finds an item, which decides what a usable field is. */
export interface LookupFieldRules {
  /** Managed index: Find Record finds items through search, so name and code fields should be searchable */
  findsThroughSearch: boolean;
  /** External source: Find Record fetches by code with an exact filter */
  codesNeedFilter: boolean;
}

export interface LookupFieldProblem {
  field: string;
  message: string;
}

/** What blocks a field (errors) or only weakens it (warnings) as a name or code field. */
function problemsWith(field: LookupFieldCandidate, as: 'name' | 'code', rules: LookupFieldRules): string[] {
  if (field.type === 'vector') return [`${field.name} holds vectors, not text`];
  if (as === 'code' && rules.codesNeedFilter && field.filterable === false) {
    return [`${field.name} can't be filtered on, so Find Record can't fetch an item by it`];
  }
  return [];
}

/** A field worth suggesting: nothing blocks or weakens it. */
const fits = (field: LookupFieldCandidate, as: 'name' | 'code', rules: LookupFieldRules) =>
  problemsWith(field, as, rules).length === 0 && weaknessesOf(field, as, rules).length === 0;

function weaknessesOf(field: LookupFieldCandidate, as: 'name' | 'code', rules: LookupFieldRules): string[] {
  const notes: string[] = [];
  if (rules.findsThroughSearch && field.searchable === false) {
    notes.push(`${field.name} isn't searchable, so Find Record only matches it on items its search finds through other fields`);
  }
  if (as === 'name' && field.nullRate !== undefined && field.nullRate > 0.5) {
    notes.push(`${field.name} is empty on ${Math.round(field.nullRate * 100)}% of sampled items, which can't be found by name`);
  }
  return notes;
}

/** The candidate for a chosen field: the field itself, or the json/object field a path (variants.sku) is under. */
function candidateFor(name: string, candidates: LookupFieldCandidate[]): LookupFieldCandidate | undefined {
  const exact = candidates.find((f) => f.name === name);
  if (exact) return exact;
  const parent = candidates.find((f) => f.hasPaths && name.startsWith(`${f.name}.`));
  return parent && { ...parent, name, filterable: undefined };
}

/**
 * Check a tool's chosen fields against its data source's fields. Only the fields in `checked`
 * are checked (the ones a save changes), so a tool saved for another reason never fails on a
 * field chosen earlier. Errors block the save; warnings are shown with it.
 */
export function checkLookupFields(
  config: LookupFieldsConfig | undefined,
  candidates: LookupFieldCandidate[],
  rules: LookupFieldRules,
  checked?: ReadonlySet<string>,
): { errors: LookupFieldProblem[]; warnings: LookupFieldProblem[] } {
  const errors: LookupFieldProblem[] = [];
  const warnings: LookupFieldProblem[] = [];
  const nameFields = Array.isArray(config?.nameFields) ? config!.nameFields : [];
  const codeFields = Array.isArray(config?.codeFields) ? config!.codeFields : [];

  for (const [list, as] of [[nameFields, 'name'], [codeFields, 'code']] as const) {
    for (const name of list) {
      if (checked && !checked.has(name)) continue;
      if (typeof name !== 'string' || name.trim() === '') {
        errors.push({ field: String(name), message: `A ${as} field needs a name` });
        continue;
      }
      if (as === 'code' && nameFields.includes(name)) {
        errors.push({ field: name, message: `${name} is chosen as both a name field and a code field` });
        continue;
      }
      const candidate = candidateFor(name, candidates);
      if (!candidate) {
        errors.push({ field: name, message: `${name} isn't a field of this data source` });
        continue;
      }
      errors.push(...problemsWith(candidate, as, rules).map((message) => ({ field: name, message })));
      warnings.push(...weaknessesOf(candidate, as, rules).map((message) => ({ field: name, message })));
    }
  }
  return { errors, warnings };
}

/** Chosen fields the data source no longer has (removed or renamed in the index). */
export function missingLookupFields(config: LookupFieldsConfig | undefined, candidates: LookupFieldCandidate[]): string[] {
  const { nameFields, codeFields } = chosenLookupFields(config);
  const idField = typeof config?.idField === 'string' && config.idField ? [config.idField] : [];
  return [...new Set([...nameFields, ...codeFields, ...idField])].filter((name) => !candidateFor(name, candidates));
}
