// src/features/data-source/external-search/connectors/content-hub.schema.ts

/**
 * Sitecore Content Hub — schema and entity mapping
 *
 * Pure functions between Content Hub's entity model and the data source schema:
 * an entity definition becomes the source's fields, and an entity becomes a flat
 * record (for field profiling and, later, search hits). Free of I/O so the
 * mapping is unit-testable on its own.
 *
 * Content Hub has a real schema API, so unlike Sitecore Search the fields are
 * authoritative (`discoveredFrom: 'mapping'`): property types, which properties are
 * full-text indexed, which strings are option lists, and which relations point at
 * taxonomies all come from the definition, not from guessing at a sample.
 */

import type {
  ContentHubDefinition,
  ContentHubEntity,
  ContentHubMember,
  ContentHubRelatedEntity,
  ContentHubRelationValue,
} from './content-hub.client';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { inferFieldRole } from '@/shared/utils/field-roles';


/** Field display names longer than this are dropped silently further down the line. */
const MAX_DISPLAY_NAME = 255;

// ============================================================================
// FIELDS
// ============================================================================

/**
 * The entity's own identity and timestamps. Every definition has them; SearchAfter can
 * filter on the dates and sort on all four.
 */
export const CONTENT_HUB_SYSTEM_FIELDS: DataSourceField[] = [
  {
    name: 'id', displayName: 'Entity id', type: 'number', providerType: 'System', role: 'id',
    isSearchable: false, isFacetable: false, isFilterable: true, isRetrievable: true, isSortable: true,
    description: 'Content Hub entity id',
  },
  {
    name: 'identifier', displayName: 'Identifier', type: 'text', providerType: 'System', role: null,
    isSearchable: false, isFacetable: false, isFilterable: true, isRetrievable: true, isSortable: true,
    description: 'Content Hub entity identifier',
  },
  {
    name: 'created_on', displayName: 'Created on', type: 'date', providerType: 'System', role: 'date',
    isSearchable: false, isFacetable: false, isFilterable: true, isRetrievable: true, isSortable: true,
  },
  {
    name: 'modified_on', displayName: 'Modified on', type: 'date', providerType: 'System', role: 'date',
    isSearchable: false, isFacetable: false, isFilterable: true, isRetrievable: true, isSortable: true,
  },
];

/** The portal page an entity opens on: a link on every hit. */
export const CONTENT_HUB_URL_FIELD: DataSourceField = {
  name: 'url', displayName: 'Portal link', type: 'url', providerType: 'Portal', role: 'url',
  isSearchable: false, isFacetable: false, isFilterable: false, isRetrievable: true, isSortable: false,
  description: 'Link to the entity in the Content Hub portal',
};

/** A public preview of the entity's image (its own, or its image relation's). */
export const CONTENT_HUB_IMAGE_FIELD: DataSourceField = {
  name: 'image_url', displayName: 'Preview image', type: 'image_url', providerType: 'PublicLink', role: 'image',
  isSearchable: false, isFacetable: false, isFilterable: false, isRetrievable: true, isSortable: false,
  description: 'Public link to the preview rendition, when one exists',
};

/** Content Hub's relation from an asset to its public links. */
export const PUBLIC_LINK_RELATION = 'AssetToPublicLink';

/** Whether the definition's entities carry public links themselves (assets do). */
export function hasPublicLinks(definition: ContentHubDefinition): boolean {
  return (definition.member_groups ?? []).some((g) => (g.members ?? []).some((m) => m.name === PUBLIC_LINK_RELATION));
}

// ============================================================================
// PORTAL PAGES
// ============================================================================

/** A portal page, the parts needed to choose an entity's detail page. */
export interface ContentHubPortalPage {
  identifier?: string;
  path?: string;
  definition?: string;
  route?: string;
  visible?: boolean;
  template?: boolean;
}

const NOT_A_DETAIL_PAGE = /creat|massedit|mass-edit|modal|test|before|import|usage|confirm|video|basic|search|overview|edit/i;

/**
 * The page that shows one entity of a definition. Tenants carry many pages per definition
 * (creation forms, mass edits, modals, experiments); the detail page is the visible,
 * non-template one rendered as an entity page whose name does not say otherwise, and among
 * those the one with the shortest path ("asset", "ch-productdetails").
 */
export function pickDetailPage(pages: ContentHubPortalPage[], definition: string): ContentHubPortalPage | undefined {
  const candidates = pages.filter((p) => p.definition === definition && p.path && p.visible !== false && p.template !== true
    && (p.route === undefined || p.route === 'editorialrender' || p.route === 'detail'));
  const named = candidates.filter((p) => !NOT_A_DETAIL_PAGE.test(`${p.identifier ?? ''} ${p.path ?? ''}`));
  const pool = named.length ? named : candidates;
  return [...pool].sort((a, b) => (a.path!.length - b.path!.length) || a.path!.localeCompare(b.path!))[0];
}

/** The URL of an entity's page: `<host>/<culture>/<path>/<id>`. */
export function portalUrl(host: string, culture: string, path: string, id: number): string {
  return `${host}/${culture.toLowerCase()}/${path.replace(/^\/+|\/+$/g, '')}/${id}`;
}

/** The public URL of a public link: the tenant's CDN path with the version hash. */
export function publicLinkUrl(host: string, relativeUrl: string, versionHash?: string): string {
  return `${host}/api/public/content/${relativeUrl}${versionHash ? `?v=${versionHash}` : ''}`;
}

/** The storage key of an entity's preview rendition, else its main file: what public links are keyed by. */
export function fileKeysOf(entity: ContentHubEntity): { preview?: string; original?: string } {
  const props = entity.properties ?? {};
  const renditions = props.Renditions as { preview?: { locations?: { local?: string[] } } } | undefined;
  const main = props.MainFile as { locations?: { local?: string[] } } | undefined;
  return { preview: renditions?.preview?.locations?.local?.[0], original: main?.locations?.local?.[0] };
}

function label(member: { name: string; labels?: Record<string, string> }, culture: string): string {
  const text = member.labels?.[culture] ?? Object.values(member.labels ?? {})[0] ?? humanize(member.name);
  return text.length > MAX_DISPLAY_NAME ? text.slice(0, MAX_DISPLAY_NAME) : text;
}

/**
 * A role from the member name. Custom members are namespaced (`Acme.PCM.Price`), which the
 * name-based inference does not see through, so the last segment is tried as well.
 */
function roleOf(name: string): DataSourceField['role'] {
  return inferFieldRole(name) ?? inferFieldRole(name.split('.').pop() ?? name) ?? null;
}

function humanize(name: string): string {
  return name.split('.').pop()!.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Last path segment of an href, decoded: the definition name or the entity id. */
export function hrefName(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '');
}

/** Content Hub member type → the normalized field type. */
function fieldType(member: ContentHubMember): string {
  switch (member.type) {
    case 'Boolean':
      return 'boolean';
    case 'Integer':
    case 'Long':
    case 'Decimal':
    case 'Double':
      return 'number';
    case 'DateTime':
    case 'Date':
      return 'date';
    default:
      return 'text';
  }
}

function propertyField(member: ContentHubMember, culture: string): DataSourceField {
  const type = fieldType(member);
  const optionList = member.datasource?.href ? hrefName(member.datasource.href) : undefined;
  const multi = member.is_multivalue === true;
  const html = member.content_type === 'Html';
  const role = roleOf(member.name) ?? (html ? 'description' : null);

  return {
    name: member.name,
    displayName: label(member, culture),
    type,
    providerType: `${member.type}${multi ? '[]' : ''}${optionList ? ':OptionList' : ''}`,
    role,
    // FullText only reaches properties the definition marks as content
    isSearchable: type === 'text' && !optionList && member.included_in_content === true,
    // Option lists have a finite value set that enumerate can list
    isFacetable: Boolean(optionList),
    isFilterable: true,
    isRetrievable: !member.is_secret,
    isSortable: !multi && !html,
    ...(optionList && { description: `Option list ${optionList}` }),
  };
}

function relationField(member: ContentHubMember, culture: string): DataSourceField {
  const target = hrefName(member.associated_entitydefinition?.href) ?? 'entity';
  const taxonomy = member.is_taxonomy_relation === true;
  const many = member.cardinality === 'ManyToMany';

  return {
    name: member.name,
    displayName: label(member, culture),
    type: 'text',
    providerType: `Relation${many ? '[]' : ''}:${target}`,
    role: roleOf(member.name) ?? (taxonomy ? 'category' : null),
    isSearchable: false,
    // A taxonomy's items are the facet values; other parents (users, assets) are not a list to offer
    isFacetable: taxonomy,
    isFilterable: true,
    isRetrievable: true,
    isSortable: false,
    description: `${taxonomy ? 'Taxonomy' : 'Relation'} ${target}`,
  };
}

/**
 * The fields of a Content Hub entity definition, in the order the definition lists them:
 * the system fields, then each property, then each relation the entity is the child of
 * (hits carry their parents: the asset type, the lifecycle status, the category). Relations
 * the entity is the parent of (its children: public links, variants) are never inlined by
 * search and are left out.
 */
export function inferContentHubFields(definition: ContentHubDefinition, culture = 'en-US', options: { imageRelation?: string } = {}): DataSourceField[] {
  const fields: DataSourceField[] = [...CONTENT_HUB_SYSTEM_FIELDS, CONTENT_HUB_URL_FIELD];
  if (hasPublicLinks(definition) || options.imageRelation) fields.push(CONTENT_HUB_IMAGE_FIELD);
  const seen = new Set(fields.map((f) => f.name));

  for (const group of definition.member_groups ?? []) {
    for (const member of group.members ?? []) {
      if (!member?.name || seen.has(member.name)) continue;
      if (member.type === 'Relation') {
        if (member.role !== 'Child') continue;
        fields.push(relationField(member, culture));
      } else {
        if (member.is_secret) continue;
        fields.push(propertyField(member, culture));
      }
      seen.add(member.name);
    }
  }
  return fields;
}

// ============================================================================
// ENTITIES
// ============================================================================

const CULTURE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;

/** A property value for one culture: multilingual values are objects keyed by culture. */
function cultureValue(value: unknown, culture: string): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0 && keys.every((k) => CULTURE_KEY.test(k))) {
      const record = value as Record<string, unknown>;
      return record[culture] ?? record[keys[0]];
    }
  }
  return value;
}

/** An option-list value is `{ identifier, labels }`; read its label, else its identifier. */
function optionValue(value: unknown, culture: string): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'identifier' in value) {
    const option = value as { identifier?: unknown; labels?: Record<string, string> };
    const text = option.labels?.[culture] ?? Object.values(option.labels ?? {})[0];
    return text || option.identifier;
  }
  return value;
}

function propertyValue(value: unknown, culture: string): unknown {
  const cultured = cultureValue(value, culture);
  return Array.isArray(cultured) ? cultured.map((v) => optionValue(v, culture)) : optionValue(cultured, culture);
}

/** A related entity as a hit shows it: its label when loaded, else its id. */
function relatedValue(related: ContentHubRelatedEntity, culture: string): string | number | undefined {
  const props = related.properties ?? {};
  for (const key of ['TaxonomyLabel', 'Label', 'Name', 'Title', 'StatusValue', 'TaxonomyName']) {
    const text = cultureValue(props[key], culture);
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  const id = hrefName(related.href);
  return id && /^\d+$/.test(id) ? Number(id) : id;
}

/**
 * The parents (or children) a relation value inlines. A relation that was not loaded, or
 * is empty, carries only its link and yields nothing.
 */
export function relatedEntities(value: ContentHubRelationValue | undefined): ContentHubRelatedEntity[] {
  if (!value) return [];
  if (value.parents) return value.parents;
  if (value.parent) return [value.parent];
  if (value.children) return value.children;
  if (value.child) return [value.child];
  return [];
}

/**
 * Flatten an entity into one record: system fields, properties for the culture (option
 * lists as their label), and each loaded relation as its parents' labels (a single value
 * for one parent, a list for many). Relations that were not loaded are left out rather
 * than reported empty, so profiling does not count them as null.
 */
export function flattenContentHubEntity(entity: ContentHubEntity, culture = 'en-US'): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: entity.id,
    identifier: entity.identifier,
    created_on: entity.created_on,
    modified_on: entity.modified_on,
  };
  for (const [name, value] of Object.entries(entity.properties ?? {})) {
    record[name] = propertyValue(value, culture);
  }
  for (const [name, value] of Object.entries(entity.relations ?? {})) {
    if (!value || (!value.parent && !value.parents && !value.child && !value.children)) continue;
    const related = relatedEntities(value).map((r) => relatedValue(r, culture)).filter((v) => v !== undefined);
    record[name] = value.parent || value.child ? related[0] ?? null : related;
  }
  return record;
}
