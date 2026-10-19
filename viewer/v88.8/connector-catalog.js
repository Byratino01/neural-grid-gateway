// Presentation metadata for the browser monitor, sourced from the same
// declarative inventory used by the gateway API.
(() => {
  'use strict';
  window.__NG_CONNECTORS = Object.freeze([
    {id:'github',name:'GitHub'},
    {id:'render',name:'Render'},
    {id:'netlify',name:'Netlify'},
    {id:'chatgpt',name:'ChatGPT'},
    {id:'truck-scanner',name:'Truck Scanner'}
  ].map(entry => Object.freeze(entry)));
})();
