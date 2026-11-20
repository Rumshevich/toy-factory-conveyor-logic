# Shift configuration validation

The shift configuration is validated against JSON Schema after AJAX loading and
JSON parsing. `LevelConfig: On parse success` calls `LoadShiftConfig`, which runs
one JavaScript action instead of a separate event for each validation rule.

## Runtime files (Construct: Files)

- `level-config.json`: settings for the shift; unchanged from the supplied project.
- `level-config.schema.json`: standard JSON Schema draft-07, editable in Construct.
- `shift-config-validator.js`: local browser bundle containing Ajv 8.20.0 and the
  adapter. Loaded with `runtime.assets.loadScripts`, without a CDN or remote dependency.
- `ajv-LICENSE.txt`: license for the bundled dependency.

The schema is fetched through `runtime.assets.fetchJson` and compiled once per
runtime. Editing it or the configuration requires restarting preview, **not**
rebuilding the bundle. No schema-driven values are coerced, defaulted or removed.
Unknown fields are rejected to catch typos. `seed` is optional and may be an
integer or null. Monetary values can be zero or fractional; no arbitrary upper
game balance limits are applied. Colors must be nonempty strings, but this
validator does not know which graphics/colors the game supports.

The JavaScript adapter also validates relationships from the task description:
order bounds, weight count and positive finite sum, feasible budget range and
warning time. Relationship checks run after schema validation passes, so malformed
nested data cannot throw. All errors from the current validation phase are logged
individually and joined with newlines in `LevelConfigError`.

Integer counters and seed must be safe JavaScript integers. Budget products must
also be safe integers. These checks protect arithmetic precision; they do not
set a practical memory/CPU budget. A billion orders is not rejected merely for
being a billion. Weight-aware order-budget reachability remains the future order
generator's concern; min/max feasibility alone does not prove reachability.

`LevelConfigLoaded` stays zero until all asynchronous loading and validation
finishes. Consumers must wait for it to become one; a Construct function call
returning does not imply readiness. AJAX, JSON syntax, bundle and schema failures
leave readiness zero and report an error. A schema with an unsupported keyword or
invalid rule fails explicitly in Ajv strict mode.

This change does not start a shift, gate the existing debug conveyor, or copy
settings into run variables (that wiring remains a subsequent step). Assembly
recipes, gameplay events outside SHIFT CONFIG and graphics are preserved.

## Try in Construct

1. Open `project.c3proj` in Construct and start preview.
2. Open the preview window's browser console. Expect one `[SHIFT CONFIG] OK` line;
   `maxActiveOrders: 6` from the supplied file is valid now.
3. Change `maxActiveOrders` to `"6"`, remove `durationSeconds`, or set `colors` to
   `[]`; restart preview. Expect field-specific errors and readiness zero.
4. Set `toysBudget` to `100`: expect the allowed-budget error. Set the warning time
   equal to the duration: expect a relationship error.
5. Break JSON syntax (for example, remove a comma): expect the existing parse-error
   handler to log the failure. Restore the file afterward.
6. Test a missing schema or validator file, then restore it and restart preview.
7. Check assembly still works. Startup must request both `assembly-recipes.json`
   and `level-config.json` using their distinct AJAX tags and JSON objects.

Assembly was confirmed working in preview by the project owner. Automated checks
do not run the Construct editor or an exported game.

## Development

```sh
npm ci
npm run build:config-validator
npm run test:config
```

Rebuild only after changing `tools/shift-config-validator/validator.js` or updating
Ajv. This bundles a general validator library; **it does not generate validation
code from this particular schema**. Commit the bundle and license with source
changes. The bundle needs dynamic code compilation (`new Function`) when Ajv
compiles a schema; deployments that forbid it via CSP will need a precompiled
validator instead.

Tests exercise the actual browser bundle in an isolated JavaScript context,
schema rules, relationship errors, flags, failures/retry, asynchronous readiness,
schema changes without rebuild, and the actual script action stored in the event
sheet. They do not substitute for a Construct preview/export test.
