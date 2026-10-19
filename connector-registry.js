// Declarative inventory only. Listing an app does not establish connectivity.
export const connectors = Object.freeze([
  {id:"github",name:"GitHub",stationId:"github",icon:"./assets/icons/github.svg",supportedEvents:["github.workflow.*","github.push.*","github.pull_request.*"],transport:"signed_webhook"},
  {id:"render",name:"Render",stationId:"render",icon:"./assets/icons/render.svg",supportedEvents:["render.deploy.*","render.service.*"],transport:"not_configured"},
  {id:"netlify",name:"Netlify",stationId:"netlify",icon:"./assets/icons/netlify.svg",supportedEvents:["netlify.deploy.*"],transport:"not_configured"},
  {id:"chatgpt",name:"ChatGPT",stationId:"chatgpt",icon:"./assets/icons/openai.svg",supportedEvents:["chatgpt.activity.*"],transport:"not_configured"},
  {id:"truck-scanner",name:"Truck Scanner",stationId:"truck-scanner",icon:null,supportedEvents:["truck-scanner.scan.*","truck-scanner.trip.*"],transport:"not_configured"}
].map(c=>Object.freeze({...c,supportedEvents:Object.freeze(c.supportedEvents)})));
const byId=new Map(connectors.map(c=>[c.id,c]));
export function listConnectors({githubWebhookConfigured=false}={}) {
  return connectors.map(c=>({...c,supportedEvents:[...c.supportedEvents],
    status:c.id==="github"&&githubWebhookConfigured?"configured":"unconnected",
    connected:false,lastObservedAt:null}));
}
export function routeConnectorEvent(event) {
  const source=byId.get(event?.source);
  const destination=byId.get(event?.destination);
  return {
    sourceConnectorId:source?.id??null,
    sourceStationId:source?.stationId??null,
    destinationConnectorId:destination?.id??null,
    destinationStationId:destination?.stationId??null,
    // A destination label is not proof that one application contacted another.
    verifiedAppToApp:false
  };
}
