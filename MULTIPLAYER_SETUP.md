# Multiplayer setup

The Batch 001 release is intentionally local-only. Multiplayer source, Firebase configuration, and Cloudflare credentials are not implemented or required.

Future setup will use a Cloudflare Worker and Durable Object for a room, with a browser WebSocket client. The server must remain authoritative for movement limits, inventory changes, gathering, building, damage, vehicles, and NPC actions.
