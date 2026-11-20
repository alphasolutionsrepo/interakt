// src/features/data-source/external-search/connectors/content-hub.schema.test.ts

import { describe, it, expect } from 'vitest';

import type { ContentHubDefinition, ContentHubEntity } from './content-hub.client';
import { andFilters, buildSearchAfterBody, orFilters } from './content-hub.client';
import { fileKeysOf, flattenContentHubEntity, hrefName, inferContentHubFields, pickDetailPage, portalUrl, publicLinkUrl } from './content-hub.schema';

/** A trimmed product definition, as GET /api/entitydefinitions/M.PCM.Product answers. */
const PRODUCT: ContentHubDefinition = {
  name: 'M.PCM.Product',
  labels: { 'en-US': 'Product' },
  member_groups: [
    {
      name: 'General',
      members: [
        { name: 'ProductNumber', type: 'String', content_type: 'SingleLine', labels: { 'en-US': 'Product Name' }, included_in_content: true },
        { name: 'Acme.PCM.ProductDescription', type: 'String', content_type: 'Html', labels: { 'en-US': 'Description' }, included_in_content: true },
        { name: 'Acme.PCM.Product.ItemStatus', type: 'String', content_type: 'SingleLine', labels: { 'en-US': 'Item Status' }, datasource: { href: 'https://tenant.example/api/datasources/Acme.PCM.Product.ItemStatus' } },
        { name: 'Acme.PCM.HideFromCustomer', type: 'Boolean', labels: { 'en-US': 'Hide from customer' } },
        { name: 'Acme.PCM.Sizes', type: 'String', is_multivalue: true, labels: {} },
        { name: 'ApiToken', type: 'String', is_secret: true, labels: { 'en-US': 'Token' } },
        { name: 'Acme.PCM.Category', type: 'Relation', role: 'Child', cardinality: 'ManyToMany', is_taxonomy_relation: true, labels: { 'en-US': 'Category' }, associated_entitydefinition: { href: 'https://tenant.example/api/entitydefinitions/Acme.PCM.Category' } },
        { name: 'PCMProductToMasterAsset', type: 'Relation', role: 'Parent', cardinality: 'OneToMany', labels: { 'en-US': 'Master asset' }, associated_entitydefinition: { href: 'https://tenant.example/api/entitydefinitions/M.Asset' } },
        { name: 'AssignedUserToProduct', type: 'Relation', role: 'Child', cardinality: 'ManyToMany', labels: { 'en-US': 'Assigned user' }, associated_entitydefinition: { href: 'https://tenant.example/api/entitydefinitions/User' } },
      ],
    },
    {
      name: 'Dates',
      members: [
        { name: 'Acme.PCM.ActivationDate', type: 'DateTime', labels: { 'en-US': 'Activation date' } },
        { name: 'Acme.PCM.Price', type: 'Decimal', labels: { 'en-US': 'Price' } },
      ],
    },
  ],
};

describe('inferContentHubFields', () => {
  const fields = inferContentHubFields(PRODUCT);
  const byName = new Map(fields.map((f) => [f.name, f]));

  it('starts with the system fields, then properties and child relations in definition order', () => {
    expect(fields.map((f) => f.name)).toEqual([
      'id', 'identifier', 'created_on', 'modified_on', 'url',
      'ProductNumber', 'Acme.PCM.ProductDescription', 'Acme.PCM.Product.ItemStatus', 'Acme.PCM.HideFromCustomer', 'Acme.PCM.Sizes',
      'Acme.PCM.Category', 'AssignedUserToProduct',
      'Acme.PCM.ActivationDate', 'Acme.PCM.Price',
    ]);
  });

  it('marks only full-text indexed string properties searchable', () => {
    expect(byName.get('ProductNumber')?.isSearchable).toBe(true);
    expect(byName.get('Acme.PCM.ProductDescription')?.isSearchable).toBe(true);
    expect(byName.get('Acme.PCM.Product.ItemStatus')?.isSearchable).toBe(false);
    expect(byName.get('Acme.PCM.HideFromCustomer')?.isSearchable).toBe(false);
  });

  it('reads display names from the labels, falling back to a humanized name', () => {
    expect(byName.get('ProductNumber')?.displayName).toBe('Product Name');
    expect(byName.get('Acme.PCM.Sizes')?.displayName).toBe('Sizes');
  });

  it('types properties from the member type and keeps the provider type verbatim', () => {
    expect(byName.get('Acme.PCM.HideFromCustomer')).toMatchObject({ type: 'boolean', providerType: 'Boolean' });
    expect(byName.get('Acme.PCM.ActivationDate')).toMatchObject({ type: 'date', providerType: 'DateTime', role: 'date' });
    expect(byName.get('Acme.PCM.Price')).toMatchObject({ type: 'number', providerType: 'Decimal', role: 'price' });
    expect(byName.get('Acme.PCM.Sizes')).toMatchObject({ type: 'text', providerType: 'String[]', isSortable: false });
  });

  it('makes option-list properties facetable and names the list', () => {
    expect(byName.get('Acme.PCM.Product.ItemStatus')).toMatchObject({
      isFacetable: true,
      isFilterable: true,
      providerType: 'String:OptionList',
      description: 'Option list Acme.PCM.Product.ItemStatus',
    });
  });

  it('names a title when no member is called so: the first searchable text ending in Name or Title', () => {
    expect(fields.filter((f) => f.role === 'title').map((f) => f.name)).toEqual([]);
    const named: ContentHubDefinition = {
      ...PRODUCT,
      member_groups: [{ name: 'General', members: [
        { name: 'Acme.PCM.BrandName', type: 'String', labels: {} },
        { name: 'Acme.PCM.ProductName', type: 'String', labels: {}, included_in_content: true },
        { name: 'Title', type: 'String', labels: {} },
      ] }],
    };
    expect(inferContentHubFields(named).filter((f) => f.role === 'title').map((f) => f.name)).toEqual(['Title']);
    named.member_groups![0].members!.pop();
    expect(inferContentHubFields(named).filter((f) => f.role === 'title').map((f) => f.name)).toEqual(['Acme.PCM.ProductName']);
  });

  it('keeps child relations as filterable fields, facetable when they point at a taxonomy', () => {
    expect(byName.get('Acme.PCM.Category')).toMatchObject({
      type: 'text',
      providerType: 'Relation[]:Acme.PCM.Category',
      role: 'category',
      isFacetable: true,
      isFilterable: true,
      isSearchable: false,
      description: 'Taxonomy Acme.PCM.Category',
    });
    expect(byName.get('AssignedUserToProduct')).toMatchObject({ isFacetable: false, isFilterable: true, description: 'Relation User' });
  });

  it('leaves out parent-side relations and secret properties', () => {
    expect(byName.has('PCMProductToMasterAsset')).toBe(false);
    expect(byName.has('ApiToken')).toBe(false);
  });

  it('treats HTML properties as descriptions that cannot be sorted', () => {
    expect(byName.get('Acme.PCM.ProductDescription')).toMatchObject({ role: 'description', isSortable: false });
  });
});

describe('portal pages and links', () => {
  const pages = [
    { identifier: 'Portal.Page.AssetDetail', path: 'asset', definition: 'M.Asset', route: 'editorialrender', visible: true },
    { identifier: 'Portal.Page.BasicAsset', path: 'basic-Asset', definition: 'M.Asset', route: 'editorialrender', visible: false },
    { identifier: 'Portal.Page.AssetDetailVideo', path: 'asset-video', definition: 'M.Asset', route: 'editorialrender', visible: true },
    { identifier: 'Portal.Page.ConfirmDownload', path: 'confirm-download', definition: 'M.Asset', route: 'editorialrender', visible: true },
    { identifier: 'Portal.Page.AssetMassEdit', path: 'a', definition: 'M.Asset', route: 'massedit', visible: true, template: true },
    { identifier: 'Portal.Page.Products.ProductCreation', path: 'ch-productcreation', definition: 'M.PCM.Product', route: 'editorialrender', visible: true },
    { identifier: 'Portal.Page.Products.ProductDetails', path: 'ch-productdetails', definition: 'M.PCM.Product', route: 'editorialrender', visible: true },
  ];

  it('picks the visible, non-template detail page with the shortest path', () => {
    expect(pickDetailPage(pages, 'M.Asset')?.path).toBe('asset');
    expect(pickDetailPage(pages, 'M.PCM.Product')?.path).toBe('ch-productdetails');
    expect(pickDetailPage(pages, 'M.Nothing')).toBeUndefined();
  });

  it('builds portal and public-link URLs', () => {
    expect(portalUrl('https://tenant.example', 'en-US', '/asset/', 544)).toBe('https://tenant.example/en-us/asset/544');
    expect(publicLinkUrl('https://tenant.example', 'abc123', 'v9')).toBe('https://tenant.example/api/public/content/abc123?v=v9');
    expect(publicLinkUrl('https://tenant.example', 'abc123')).toBe('https://tenant.example/api/public/content/abc123');
  });

  it('reads the preview and original storage keys of an asset', () => {
    expect(fileKeysOf({ id: 1, properties: { Renditions: { preview: { locations: { local: ['local-p'] } } }, MainFile: { locations: { local: ['local-o'] } } } })).toEqual({ preview: 'local-p', original: 'local-o' });
    expect(fileKeysOf({ id: 2 })).toEqual({ preview: undefined, original: undefined });
  });

  it('adds the link field to every definition and the image field to ones with public links or an image relation', () => {
    const names = inferContentHubFields(PRODUCT).map((f) => f.name);
    expect(names).toContain('url');
    expect(names).not.toContain('image_url');
    expect(inferContentHubFields(PRODUCT, 'en-US', { imageRelation: 'ProductToMasterAsset' }).map((f) => f.name)).toContain('image_url');
    const asset: ContentHubDefinition = { name: 'M.Asset', member_groups: [{ members: [{ name: 'AssetToPublicLink', type: 'Relation', role: 'Parent' }] }] };
    expect(inferContentHubFields(asset).map((f) => f.name)).toContain('image_url');
  });
});

describe('flattenContentHubEntity', () => {
  const entity: ContentHubEntity = {
    id: 2926373,
    identifier: 'abc',
    created_on: '2025-01-01T00:00:00Z',
    modified_on: '2025-06-01T00:00:00Z',
    properties: {
      ProductNumber: 'Marina Painted Gray 5pc',
      Title: { 'en-US': 'English', 'da-DK': 'Dansk' },
      'Acme.PCM.Product.ItemStatus': { identifier: 'Acme.PCM.Product.ItemStatus.Active', labels: {} },
      'Acme.PCM.Brand': { identifier: 'Acme.PCM.Brand.Brandco', labels: { 'en-US': 'Brandco' } },
      Sizes: ['S', 'M'],
      Empty: null,
    },
    relations: {
      'Acme.PCM.Category': { parents: [{ href: 'https://tenant.example/api/entities/2704385', properties: { TaxonomyLabel: { 'en-US': 'Cabinets' } } }] },
      FinalLifeCycleStatusToAsset: { parent: { href: 'https://tenant.example/api/entities/544', properties: { StatusValue: 'Approved' } } },
      OwnerToAsset: { parents: [{ href: 'https://tenant.example/api/entities/11282' }] },
      NotLoaded: { href: 'https://tenant.example/api/entities/2926373/relations/NotLoaded' },
      EmptyLoaded: { parents: [] },
    },
  };

  it('flattens system fields, culture values, option lists and relations', () => {
    expect(flattenContentHubEntity(entity)).toEqual({
      id: 2926373,
      identifier: 'abc',
      created_on: '2025-01-01T00:00:00Z',
      modified_on: '2025-06-01T00:00:00Z',
      ProductNumber: 'Marina Painted Gray 5pc',
      Title: 'English',
      'Acme.PCM.Product.ItemStatus': 'Acme.PCM.Product.ItemStatus.Active',
      'Acme.PCM.Brand': 'Brandco',
      Sizes: ['S', 'M'],
      Empty: null,
      'Acme.PCM.Category': ['Cabinets'],
      FinalLifeCycleStatusToAsset: 'Approved',
      OwnerToAsset: [11282],
      EmptyLoaded: [],
    });
  });

  it('reads another culture when asked, and falls back to the first one present', () => {
    expect(flattenContentHubEntity(entity, 'da-DK').Title).toBe('Dansk');
    expect(flattenContentHubEntity(entity, 'fr-FR').Title).toBe('English');
  });
});

describe('filters and request body', () => {
  it('ORs many clauses as a balanced tree, never a deep chain', () => {
    const clauses = Array.from({ length: 100 }, (_, i) => ({ type: 'Relation' as const, relation: 'R', id: i }));
    const tree = orFilters(clauses)!;
    const depth = (f: unknown): number => {
      const node = f as { left?: unknown; right?: unknown } | null;
      return node && typeof node === 'object' && 'left' in node ? 1 + Math.max(depth(node.left), depth(node.right)) : 0;
    };
    expect(depth(tree)).toBeLessThanOrEqual(7);
    expect(orFilters([])).toBeUndefined();
    expect(orFilters([clauses[0]])).toBe(clauses[0]);
  });

  it('ANDs only present sides', () => {
    const a = { type: 'DefinitionName' as const, name: 'M.Asset' };
    expect(andFilters(a, undefined)).toBe(a);
    expect(andFilters(undefined, a)).toBe(a);
    expect(andFilters(a, a)).toEqual({ type: 'Logical', operator: 'And', left: a, right: a });
  });

  it('builds a SearchAfter body with custom loads, the culture, and a capped take', () => {
    const body = buildSearchAfterBody({
      filter: { type: 'DefinitionName', name: 'M.Asset' },
      take: 500,
      properties: ['Title'],
      relations: ['AssetTypeToAsset'],
      cultures: ['en-US'],
      searchAfter: ['x'],
    });
    expect(body).toEqual({
      filter: { type: 'DefinitionName', name: 'M.Asset' },
      take: 100,
      sorting: [{ field: 'identifier', order: 'Asc' }],
      search_after: ['x'],
      load_configuration: {
        load_entities: true,
        culture_option: { load_option: 'Custom', cultures: ['en-US'] },
        property_option: { load_option: 'Custom', properties: ['Title'] },
        relation_option: { load_option: 'Custom', relations: [{ name: 'AssetTypeToAsset' }] },
      },
      renditions: ['None'],
    });
    expect(buildSearchAfterBody({ filter: { type: 'DefinitionName', name: 'M.Asset' }, take: 0 }).take).toBe(1);
    expect(buildSearchAfterBody({ filter: { type: 'DefinitionName', name: 'M.Asset' }, take: 5, properties: 'all' }).load_configuration).toMatchObject({
      property_option: { load_option: 'All' },
      relation_option: { load_option: 'None' },
      culture_option: { load_option: 'None' },
    });
  });

  it('reads the last path segment of an href', () => {
    expect(hrefName('https://tenant.example/api/entitydefinitions/M.PCM.Category')).toBe('M.PCM.Category');
    expect(hrefName('https://tenant.example/api/entities/544/')).toBe('544');
    expect(hrefName(undefined)).toBeUndefined();
  });
});
