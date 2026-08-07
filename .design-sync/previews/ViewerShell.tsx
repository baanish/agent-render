import { useEffect, useState } from "react";
import { ViewerShell } from "agent-render";

// "Maintainer kickoff" sample fragment (deflate codec) from the homepage sample cards.
const kickoffHash = "#dVVLbThsxEP2VkXkBiUTiNVVbtRUtUqFCBbUPLBKOPZtY67UtezYhBf69x5sL8LBeey5nzpmZJ5XU7OxUrcbTqJmy3HotrE6V4HWlXRB8nKlzpottC4eGI0dte53wymp296TcO1uHV69zZ-M67JBuUgYUvca0rxnT3sJQqx_R-7gmNOET3S6Z0jD3zlBZsvcU4poCsy2kKXOwnEFQllqoZfaFvOsYrtblIhPjdUFgFtdqI6dIlurT3s-16ShlXjleT2upo0P9MyomJq7GCd093tPvsQztVZF1mY34DbmAykwVg_M--mZIKWahH04uhjl993oVM1u62qeLnnsGq2BxLR0YFyn77J_MibJe08Xt1SUqlRpsab4hTEcPXvaBX6x9wwiHR9tG0K2K1sc1UEdhl3oIZklmyaar1ar5GUQzusKEm2gZCi6_ooDZc_VOJhMY3pzV-GdUupvEMxqj7Qb_c-skZqc9SuTYMxXRm4L2CLq-zfwWLWNCwVT8Q-J1jnYw4v5BYpt178KC1k6W5HVYDHrBAHRpx-h61BUHSQNADxhfM4SC1FZ2DH5T50wwrapVAw3ptQ9HdP6o--R3RNBVH01XfQ8PD3UE_DhOrkW3xEW0lQ1on4cVeyzEMRgueg4ygz4UW5zQUxMIWyhDDpX_6J1CfJbyFzKOGwUNQSbbRf3YqBP6TI3KlXqjaIZ770oBVqM-NOFlZFIJjWtQd-sw4sOum-xKgk7q49xBSx05lKMMKGME8CSdOE_Vy_3Lfw";

/** Canonical empty-state homepage: nav bar, editorial hero, bento grid, inspector. */
export const EmptyHomepage = () => <ViewerShell />;

/** Decoded state: the sample hash is set pre-mount, so the shell decodes and renders the artifact stage. */
export const DecodedFragment = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.location.hash = kickoffHash;
    setReady(true);
  }, []);
  return ready ? <ViewerShell /> : null;
};
