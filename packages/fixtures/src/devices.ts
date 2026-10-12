import type { Device, RecordSource } from '@dossierhq/contracts';
import { formatTimestamp } from './format.js';
import { clients, NOW } from './world.js';

/** Small deterministic PRNG so generated data is the same on every run. */
export function seeded(key: string): () => number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const prefixes: Record<string, string> = {
  'harbour-dental': 'HD',
  'northside-legal': 'NL',
  'cedar-street-clinic': 'CSC',
  'marlow-freight': 'MF',
  'fenwick-rowe': 'FR',
  'bramble-hill-school': 'BH',
  'oakline-architects': 'OA',
  'saltmarsh-veterinary': 'SV',
  'kestrel-property': 'KP',
  'lindqvist-engineering': 'LE',
  'pinewood-physio': 'PP',
  'copperleaf-studio': 'CS',
  'ashby-hotel': 'AH',
  'rowan-care-homes': 'RC',
};

type Special = Partial<Device> & Pick<Device, 'name' | 'type' | 'os'>;

/** Devices the story refers to by name. The rest are generated around them. */
const specials: Record<string, { count: number; devices: Special[] }> = {
  'harbour-dental': {
    count: 24,
    devices: [
      { name: 'HD-FS01', type: 'server', os: 'Windows Server 2019' },
      {
        name: 'HD-REC-01',
        type: 'workstation',
        os: 'Windows 10 Pro 22H2',
        assignedTo: 'Reception',
        patchStatus: 'pending',
        sourceId: 'src-hd-device-rec01',
      },
      {
        name: 'HD-REC-02',
        type: 'workstation',
        os: 'Windows 10 Pro 22H2',
        assignedTo: 'Reception',
        patchStatus: 'pending',
        sourceId: 'src-hd-device-rec02',
      },
      {
        name: 'HD-LT-03',
        type: 'laptop',
        os: 'Windows 11 Pro 24H2',
        assignedTo: 'Priya Nair',
        lastSeenAt: '2026-10-01T16:48:00.000Z',
        sourceId: 'src-hd-device-lt03',
      },
      {
        name: 'HD-XRAY-01',
        type: 'workstation',
        os: 'Windows 11 Pro 24H2',
        assignedTo: 'Imaging',
      },
    ],
  },
  'northside-legal': { count: 44, devices: [] },
  'cedar-street-clinic': {
    count: 36,
    devices: [
      { name: 'CSC-SQL01', type: 'server', os: 'Windows Server 2022' },
      {
        name: 'CSC-RECEP-02',
        type: 'workstation',
        os: 'Windows 11 Pro 24H2',
        assignedTo: 'Reception',
        patchStatus: 'pending',
      },
    ],
  },
  'marlow-freight': {
    count: 62,
    devices: [
      {
        name: 'MF-LT-017',
        type: 'laptop',
        os: 'Windows 11 Pro 24H2',
        assignedTo: 'Dispatch, shared',
        lastSeenAt: '2026-10-09T07:52:00.000Z',
        sourceId: 'src-mf-alert-48177',
      },
      {
        name: 'MF-WH-SCN-01',
        type: 'network',
        os: 'Scanner firmware 3.1',
        patchStatus: 'pending',
      },
      {
        name: 'MF-WH-SCN-02',
        type: 'network',
        os: 'Scanner firmware 3.1',
        patchStatus: 'pending',
      },
    ],
  },
};

const firstNames = [
  'Alex',
  'Beth',
  'Callum',
  'Dana',
  'Eve',
  'Femi',
  'Grace',
  'Hari',
  'Isla',
  'Jon',
  'Kemi',
  'Liam',
  'Maya',
  'Niamh',
  'Owen',
  'Pia',
  'Rhys',
  'Sana',
  'Theo',
  'Uma',
  'Vik',
  'Will',
  'Yara',
  'Zak',
];
const surnames = [
  'Ahmed',
  'Bell',
  'Clarke',
  'Doyle',
  'Evans',
  'Foster',
  'Gill',
  'Hughes',
  'Iqbal',
  'Jones',
  'Khan',
  'Lewis',
  'Mason',
  'Novak',
  'Patel',
  'Reid',
];
const macClients = new Set(['copperleaf-studio', 'oakline-architects']);

function buildDevices(clientId: string, seats: number): Device[] {
  const prefix = prefixes[clientId] ?? 'XX';
  const random = seeded(clientId);
  const plan = specials[clientId];
  const count = plan?.count ?? seats + Math.ceil(seats / 8);
  const devices: Device[] = [];
  const counters: Record<Device['type'], number> = {
    server: 0,
    network: 0,
    laptop: 0,
    workstation: 0,
  };

  function add(spec: Special) {
    const n = devices.length + 1;
    const id = `dev-${clientId}-${n}`;
    devices.push({
      id,
      clientId,
      assignedTo: null,
      lastSeenAt: new Date(
        new Date(NOW).getTime() - Math.floor(random() * 180) * 60_000,
      ).toISOString(),
      patchStatus: 'current',
      sourceId: `src-dev-${id}`,
      ...spec,
    });
  }

  plan?.devices.forEach(add);
  const used = new Set(devices.map((device) => device.name));
  const codes = {
    server: 'SRV',
    network: 'NET',
    laptop: 'LT',
    workstation: 'WS',
  };

  function nextName(type: Device['type']): string {
    for (;;) {
      counters[type] += 1;
      const name = `${prefix}-${codes[type]}-${String(counters[type]).padStart(2, '0')}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  }

  const shape: Device['type'][] = [
    'server',
    ...(seats > 40 ? (['server'] as const) : []),
    'network',
    'network',
  ];
  while (devices.length < count) {
    const type = shape.shift() ?? (random() < 0.35 ? 'laptop' : 'workstation');
    const user =
      type === 'laptop' || type === 'workstation'
        ? `${firstNames[Math.floor(random() * firstNames.length)]} ${surnames[Math.floor(random() * surnames.length)]}`
        : null;
    const os =
      type === 'server'
        ? 'Windows Server 2022'
        : type === 'network'
          ? 'Firmware 7.4.4'
          : type === 'laptop' && macClients.has(clientId)
            ? 'macOS 15.6'
            : 'Windows 11 Pro 24H2';
    const name = nextName(type);
    // A few generated devices are behind, so clean clients aren't all perfect.
    const patchStatus: Device['patchStatus'] =
      !plan && random() < 0.03 ? 'pending' : 'current';
    add({ name, type, os, assignedTo: user, patchStatus });
  }
  return devices;
}

export const devices: Device[] = clients.flatMap((client) =>
  buildDevices(client.id, client.seats),
);

/** NinjaOne device records, made on demand for generated devices. */
export function deviceSource(device: Device): RecordSource {
  return {
    id: device.sourceId,
    kind: 'record',
    clientId: device.clientId,
    tool: 'ninjaone',
    recordId: `DEV-${10000 + Number(device.id.split('-').pop())}`,
    recordType: 'Device',
    title: device.name,
    recordedAt: device.lastSeenAt,
    url: `https://ninjaone.example/devices/${device.id}`,
    fields: [
      { label: 'Device', value: device.name },
      { label: 'Type', value: device.type },
      { label: 'OS', value: device.os },
      { label: 'Assigned to', value: device.assignedTo ?? 'Not assigned' },
      {
        label: 'Last seen',
        value: formatTimestamp(device.lastSeenAt, 'Europe/London'),
      },
      { label: 'Patches', value: device.patchStatus },
    ],
  };
}
