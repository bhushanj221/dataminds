// Minimal ambient declaration — plotly.js-dist-min ships no types.
// We only use it dynamically (react/purge), so typing the module as `any`
// lets namespace access (Plotly.react / Plotly.purge) type-check.
declare module "plotly.js-dist-min" {
  const Plotly: any
  export = Plotly
}
