import type { NextConfig } from "next";

const config: NextConfig = {
  // Mounts every component twice in development so that an effect which is not
  // safe to repeat shows itself here rather than in front of a customer. It is
  // why a page load hits /api twice locally and once in production.
  reactStrictMode: true,

  async headers() {
    return [{
      /* Nothing a signed-in driver is shown may be stored by anything.
       *
       * Left to itself Next labels these "public, max-age=0, must-revalidate",
       * which invites every shared cache between here and the phone to keep a
       * copy of one driver's quotes -- and, with no Vary on the cookie, to
       * hand that copy to the next request that asks for the same address.
       * The page itself is already no-store; this is the data inside it,
       * which is the part that was going stale on a second device.
       *
       * Set here rather than route by route so a route added later cannot
       * forget it. Every route under /api is a reply to the person asking,
       * computed when they ask: there is nothing here worth a cache. */
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, private" },
        // Belt and braces: says out loud what the reply depends on, so a
        // cache that stores it anyway cannot serve it to somebody else.
        { key: "Vary", value: "Cookie" },
      ],
    }, {
      // A customer's link carries their token in the path, so it is now
      // something a browser could pass on. Nothing leaves this page with it.
      source: "/quote/:token*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }];
  },
};

export default config;
