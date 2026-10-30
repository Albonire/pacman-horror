// Recursos incrustados en el unico index.html (Vite los convierte en data URI con `?inline`).
declare module "*.mp3?inline" {
  const url: string;
  export default url;
}
declare module "*.jpg?inline" {
  const url: string;
  export default url;
}
