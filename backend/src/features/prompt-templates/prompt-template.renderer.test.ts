import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  _evaluateConditionals,
  _replaceVariables,
  _stripSectionMarkers,
} from './prompt-template.renderer';
import { SYSTEM_DEFAULT_TEMPLATES } from './prompt-template.defaults';

describe('Prompt Template Renderer', () => {
  // ==========================================================================
  // Variable replacement
  // ==========================================================================

  describe('replaceVariables', () => {
    it('replaces a single variable', () => {
      expect(_replaceVariables('Hello {{name}}!', { name: 'World' }))
        .toBe('Hello World!');
    });

    it('replaces multiple variables', () => {
      expect(_replaceVariables('{{greeting}} {{name}}!', { greeting: 'Hi', name: 'Alice' }))
        .toBe('Hi Alice!');
    });

    it('replaces unknown variables with empty string', () => {
      expect(_replaceVariables('Hello {{unknown}}!', {}))
        .toBe('Hello !');
    });

    it('replaces undefined variables with empty string', () => {
      expect(_replaceVariables('Hello {{name}}!', { name: undefined }))
        .toBe('Hello !');
    });

    it('leaves text without variables unchanged', () => {
      expect(_replaceVariables('No variables here', {}))
        .toBe('No variables here');
    });

    it('handles multiple occurrences of the same variable', () => {
      expect(_replaceVariables('{{x}} and {{x}}', { x: 'val' }))
        .toBe('val and val');
    });
  });

  // ==========================================================================
  // Conditional blocks
  // ==========================================================================

  describe('evaluateConditionals', () => {
    it('includes block when variable is truthy', () => {
      const result = _evaluateConditionals(
        'Before {{#if name}}Hello {{name}}{{/if}} After',
        { name: 'World' },
      );
      expect(result).toBe('Before Hello {{name}} After');
    });

    it('removes block when variable is undefined', () => {
      const result = _evaluateConditionals(
        'Before {{#if name}}Hello {{name}}{{/if}} After',
        {},
      );
      expect(result).toBe('Before  After');
    });

    it('removes block when variable is empty string', () => {
      const result = _evaluateConditionals(
        'Before {{#if name}}Hello{{/if}} After',
        { name: '' },
      );
      expect(result).toBe('Before  After');
    });

    it('handles multiline conditional blocks', () => {
      const template = `Start
{{#if domain}}
## Domain
{{domain}}
{{/if}}
End`;
      const result = _evaluateConditionals(template, { domain: 'hockey' });
      expect(result).toContain('## Domain');
      expect(result).toContain('{{domain}}');
    });

    it('removes multiline blocks when variable is falsy', () => {
      const template = `Start
{{#if domain}}
## Domain
{{domain}}
{{/if}}
End`;
      const result = _evaluateConditionals(template, {});
      expect(result).not.toContain('## Domain');
      expect(result).toContain('Start');
      expect(result).toContain('End');
    });

    it('handles multiple conditional blocks', () => {
      const template = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}';
      expect(_evaluateConditionals(template, { a: 'yes', b: '' })).toBe('A ');
      expect(_evaluateConditionals(template, { a: '', b: 'yes' })).toBe(' B');
      expect(_evaluateConditionals(template, { a: 'yes', b: 'yes' })).toBe('A B');
    });
  });

  // ==========================================================================
  // Section marker stripping
  // ==========================================================================

  describe('stripSectionMarkers', () => {
    it('strips section start and end markers', () => {
      const input = `Before
<!-- section:rules -->
Rule content
<!-- /section:rules -->
After`;
      const result = _stripSectionMarkers(input);
      expect(result).not.toContain('<!-- section:rules -->');
      expect(result).not.toContain('<!-- /section:rules -->');
      expect(result).toContain('Rule content');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('strips multiple section markers', () => {
      const input = `<!-- section:a -->A<!-- /section:a -->
<!-- section:b -->B<!-- /section:b -->`;
      const result = _stripSectionMarkers(input);
      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result).not.toContain('section:');
    });

    it('leaves text without markers unchanged', () => {
      expect(_stripSectionMarkers('No markers here')).toBe('No markers here');
    });
  });

  // ==========================================================================
  // Full renderTemplate
  // ==========================================================================

  describe('renderTemplate', () => {
    it('renders a complete template with variables, conditionals, and sections', () => {
      const template = `You are a planner.

## Tools
{{toolList}}

<!-- section:rules -->
## Rules
1. Use exact tool slugs
2. Be precise
<!-- /section:rules -->

{{#if businessDomain}}
## Domain
{{businessDomain}}
{{/if}}`;

      const result = renderTemplate(template, {
        toolList: '- **search**: Find products',
        businessDomain: 'Hockey equipment',
      });

      expect(result).toContain('You are a planner.');
      expect(result).toContain('- **search**: Find products');
      expect(result).toContain('1. Use exact tool slugs');
      expect(result).toContain('## Domain');
      expect(result).toContain('Hockey equipment');
      expect(result).not.toContain('{{');
      expect(result).not.toContain('section:');
    });

    it('renders template with missing optional variables', () => {
      const template = `Base prompt

{{#if businessDomain}}
## Domain
{{businessDomain}}
{{/if}}

## Tools
{{toolList}}`;

      const result = renderTemplate(template, {
        toolList: '- tool1\n- tool2',
      });

      expect(result).toContain('Base prompt');
      expect(result).toContain('- tool1');
      expect(result).not.toContain('## Domain');
      expect(result).not.toContain('{{');
    });

    it('cleans up excess blank lines', () => {
      const template = `A


{{#if missing}}
removed block
{{/if}}


B`;

      const result = renderTemplate(template, {});
      // Should not have more than 2 consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).toContain('A');
      expect(result).toContain('B');
    });
  });

  // ==========================================================================
  // Verify defaults render to match original hardcoded output
  // ==========================================================================

  describe('system default templates', () => {
    it('turn planner template renders correctly with variables', () => {
      
      const planner = SYSTEM_DEFAULT_TEMPLATES.find((t: any) => t.step === 'turn_planner');

      const result = renderTemplate(planner.content, {
        toolList: '- **product-search**: Search for products',
        businessDomain: 'E-commerce',
      });

      expect(result).toContain('You are a turn planner');
      expect(result).toContain('- **product-search**: Search for products');
      expect(result).toContain('## Rules');
      expect(result).toContain('## Business domain');
      expect(result).toContain('E-commerce');
      expect(result).not.toContain('{{');
      expect(result).not.toContain('section:');
    });

    it('turn planner template omits business domain when not provided', () => {
      
      const planner = SYSTEM_DEFAULT_TEMPLATES.find((t: any) => t.step === 'turn_planner');

      const result = renderTemplate(planner.content, {
        toolList: '- **search**: Search stuff',
      });

      expect(result).toContain('You are a turn planner');
      expect(result).not.toContain('## Business domain');
    });

    it('param extraction template renders correctly', () => {
      
      const extraction = SYSTEM_DEFAULT_TEMPLATES.find((t: any) => t.step === 'param_extraction');

      const result = renderTemplate(extraction.content, {
        toolSlug: 'product-search',
        fieldDescriptions: '- **query** (string): Search query',
        requiredFields: 'query',
      });

      expect(result).toContain('Extract parameters for the tool "product-search"');
      expect(result).toContain('- **query** (string): Search query');
      expect(result).toContain('Required: query');
      expect(result).toContain('## Rules');
      expect(result).not.toContain('## Filter field constraints');
    });

    it('param extraction template includes constraints when provided', () => {
      
      const extraction = SYSTEM_DEFAULT_TEMPLATES.find((t: any) => t.step === 'param_extraction');

      const result = renderTemplate(extraction.content, {
        toolSlug: 'product-search',
        fieldDescriptions: '- **query** (string)',
        requiredFields: 'query',
        fieldConstraints: '- **brand**: Nike, Adidas, Puma',
      });

      expect(result).toContain('## Filter field constraints');
      expect(result).toContain('- **brand**: Nike, Adidas, Puma');
    });

    it('response synthesis template renders correctly', () => {
      
      const synthesis = SYSTEM_DEFAULT_TEMPLATES.find((t: any) => t.step === 'response_synthesis');

      const result = renderTemplate(synthesis.content, {
        personaInstructions: 'You are a hockey assistant.',
        actionSummary: '- product-search: searched for sticks → 4 results',
        resultData: '### product-search\n[{"id": "1"}]',
        preset: 'item_grid',
        presetInstructions: 'Write a brief summary.',
        tone: 'professional',
      });

      expect(result).toContain('You are a hockey assistant.');
      expect(result).toContain('- product-search: searched for sticks → 4 results');
      expect(result).toContain('"item_grid"');
      expect(result).toContain('Tone: professional');
      expect(result).not.toContain('## Pending actions');
    });

    it('all 5 default templates exist and have valid metadata', () => {
      

      expect(SYSTEM_DEFAULT_TEMPLATES).toHaveLength(5);

      const steps = SYSTEM_DEFAULT_TEMPLATES.map((t: any) => t.step);
      expect(steps).toContain('turn_planner');
      expect(steps).toContain('param_extraction');
      expect(steps).toContain('response_synthesis');
      expect(steps).toContain('response_synthesis_direct');
      expect(steps).toContain('response_synthesis_lightweight');

      for (const template of SYSTEM_DEFAULT_TEMPLATES) {
        expect(template.content.length).toBeGreaterThan(0);
        expect(template.metadata.variables.length).toBeGreaterThan(0);
        expect(template.label).toBeTruthy();

        // Every variable referenced in content should be in metadata
        const variableNames = new Set(template.metadata.variables.map((v: any) => v.name));
        const contentVars = template.content.match(/\{\{(\w+)\}\}/g)?.map((m: string) => m.replace(/\{\{|\}\}/g, '')) ?? [];
        for (const v of contentVars) {
          if (v !== 'if') {
            expect(variableNames.has(v)).toBe(true);
          }
        }
      }
    });
  });
});
