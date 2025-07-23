import { renderHTML } from "openapi-renderer";

export default eventHandler(
  () =>
    renderHTML({
      renderer: "scalar",
      spec: "/_openapi.json",
    }) +
    /* html */ `<script> if (window.location.hash === '') { window.location.hash = '#tag/app-routes'; } </script>`,
);
