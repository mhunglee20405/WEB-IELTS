import * as dns from 'node:dns';
import { Logger } from '@nestjs/common';

const logger = new Logger('DnsResolver');

/**
 * Applies custom DNS servers if MONGODB_DNS_SERVERS (or parameter) is set.
 * Workaround for environments (e.g. Node.js on Windows) defaulting to 127.0.0.1
 * which cannot resolve MongoDB Atlas SRV records.
 */
export function applyDnsServersOverride(customServers?: string): string[] | null {
  const raw = customServers || process.env.MONGODB_DNS_SERVERS;
  if (!raw || !raw.trim()) {
    return null;
  }

  const servers = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (servers.length === 0) {
    return null;
  }

  try {
    dns.setServers(servers);
    logger.log(`Configured custom DNS resolver servers: [${servers.join(', ')}]`);
    return servers;
  } catch (error) {
    logger.error(`Failed to set DNS servers [${servers.join(', ')}]: ${(error as Error).message}`);
    return null;
  }
}
