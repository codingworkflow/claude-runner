# CSS Architecture Refactor

## Current State

Single monolithic `styles.css` file with 3500+ lines containing:

- Duplicate selectors (e.g., `.section-header` appears 10+ times)
- Redundant button styles (`.button.primary`, `button.primary`, `.recheck-button`)
- Inconsistent naming conventions
- Mixed concerns (layout, components, themes)

## Target Architecture

### Modular Structure

```
src/styles/
├── base.css          # CSS reset, typography, VSCode variables
├── layout.css        # Grid, flexbox, spacing utilities
├── components.css    # Reusable component styles
├── panels.css        # Panel-specific styles
└── utilities.css     # Utility classes
```

### Design System Approach

```css
/* Base Components */
.btn {
  /* shared button base */
}
.btn-primary {
  /* modifier */
}
.btn-secondary {
  /* modifier */
}

/* Remove all duplicates like .recheck-button, .button.primary, etc. */
```

## Migration Strategy

### Phase 1: Extract Base Styles

- Move VSCode CSS variables and resets to `base.css`
- Extract typography rules
- Define spacing/sizing system

### Phase 2: Consolidate Component Styles

- Merge duplicate button styles into single system
- Standardize form elements (input, select, textarea)
- Create consistent card/panel styles

### Phase 3: Modularize Panel Styles

- Extract panel-specific styles to `panels.css`
- Remove layout concerns from component styles
- Create consistent panel header/content patterns

### Phase 4: Create Utilities

- Spacing utilities (.mt-1, .mb-2, etc.)
- Flexbox utilities (.flex, .items-center, etc.)
- Display utilities

## Elimination Targets

### Duplicate Selectors to Remove

- `.section-header` (appears 10+ times with slight variations)
- Button styles (consolidate 6+ button patterns)
- Dropdown styles (4+ nearly identical selectors)
- State message patterns (3+ duplicate patterns)

### Redundant Patterns

- Multiple tab navigation styles
- Repeated form styling
- Duplicate loading states
- Similar dialog/modal styles

## Success Metrics

- [ ] No CSS file > 500 lines
- [ ] 60%+ reduction in duplicate selectors
- [ ] Consistent naming convention (kebab-case)
- [ ] All VSCode themes supported
- [ ] No visual regressions
- [ ] Improved maintainability

## Implementation Order

1. **Extract base styles** - Typography, VSCode integration
2. **Consolidate components** - Buttons, forms, cards
3. **Modularize panels** - Panel-specific styles
4. **Add utilities** - Spacing, layout helpers
5. **Test thoroughly** - All themes, all components
