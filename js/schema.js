/* Facility data model: categories, field definitions, dropdown options, seed data. */
(function () {
  'use strict';

  const AREAS = ['Front of house', 'Bar / Coffee line', 'Back of house', 'Kitchen / Prep', 'Restroom', 'Storage', 'Office', 'Patio / Outdoor seating', 'Roof', 'Exterior', 'Utility / Electrical room', 'Mezzanine', 'Other'];
  const CONDITION = ['Excellent', 'Good', 'Fair', 'Poor', 'Failed'];
  const STATUS = ['In service', 'Needs repair', 'Out of service', 'Pending install', 'Retired'];
  const YESNO = ['Yes', 'No', 'Unknown'];

  // Fields every asset has, regardless of category.
  const COMMON_TOP = [
    { k: 'name', label: 'Name / Description', type: 'text', required: true, placeholder: 'e.g. Espresso machine – main bar' },
    { k: 'area', label: 'Area', type: 'select', options: AREAS },
  ];
  const COMMON_ID = [
    { k: 'make', label: 'Make / Brand', type: 'text', list: 'make' },
    { k: 'model', label: 'Model #', type: 'text' },
    { k: 'serial', label: 'Serial #', type: 'text' },
    { k: 'tag', label: 'Asset tag', type: 'text' },
  ];
  const COMMON_BOTTOM = [
    { k: 'condition', label: 'Condition', type: 'select', options: CONDITION },
    { k: 'status', label: 'Status', type: 'select', options: STATUS },
    { k: 'vendorId', label: 'Service vendor', type: 'vendor' },
    { k: 'installDate', label: 'Install date', type: 'date' },
    { k: 'warrantyExp', label: 'Warranty expires', type: 'date' },
    { k: 'replacementCost', label: 'Replacement cost ($)', type: 'number', placeholder: 'For repair vs. replace' },
    { k: 'lastService', label: 'Last service', type: 'date' },
    { k: 'nextService', label: 'Next service due', type: 'date' },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    { k: '_photos', label: 'Photos & files', type: 'photos', full: true },
  ];

  // Each category: id, label, icon (emoji), brands datalist, type options, and extra fields.
  const CATEGORIES = [
    {
      id: 'coffee', label: 'Coffee Equipment', icon: '☕',
      types: ['Espresso machine', 'Espresso grinder', 'Bulk / batch grinder', 'Batch brewer', 'Pour-over station', 'Cold brew system', 'Nitro / kegerator', 'Hot water tower', 'Blender', 'Milk frother / steamer', 'Tea brewer', 'Water boiler', 'Other'],
      brands: ['La Marzocco', 'Slayer', 'Synesso', 'Victoria Arduino', 'Modbar', 'Mahlkönig', 'Mazzer', 'Anfim', 'Ditting', 'Fetco', 'Bunn', 'Curtis', 'Marco', 'Toddy', 'Vitamix', 'Blendtec', 'Bonavita', 'Wilbur Curtis'],
      fields: [
        { k: 'groups', label: 'Groups / heads', type: 'select', options: ['1', '2', '3', '4', 'N/A'] },
        { k: 'voltage', label: 'Voltage / phase', type: 'select', options: ['120V 1Ø', '208V 1Ø', '208V 3Ø', '240V 1Ø', 'Other'] },
        { k: 'waterLine', label: 'Water filter feeding unit', type: 'text' },
        { k: 'gasketDate', label: 'Gaskets / screens last replaced', type: 'date' },
        { k: 'descaleDate', label: 'Last descale / backflush service', type: 'date' },
        { k: 'burrDate', label: 'Burrs last replaced (grinders)', type: 'date' },
      ],
    },
    {
      id: 'icewater', label: 'Ice & Water / Filters', icon: '🧊',
      types: ['Ice machine', 'Ice bin', 'Ice dispenser', 'Water filtration system', 'Reverse osmosis (RO)', 'Water softener', 'Sediment pre-filter', 'Drinking fountain / bottle filler', 'Other'],
      brands: ['Hoshizaki', 'Manitowoc', 'Scotsman', 'Ice-O-Matic', 'Follett', 'Everpure', '3M / Cuno', 'BWT', 'Pentair Optimum', 'Brita Professional', 'Elkay'],
      fields: [
        { k: 'capacity', label: 'Capacity (lbs/day or GPD)', type: 'text' },
        { k: 'cubeType', label: 'Ice type', type: 'select', options: ['Full cube', 'Half cube', 'Nugget / chewable', 'Flake', 'Gourmet', 'N/A'] },
        { k: 'cooling', label: 'Condenser', type: 'select', options: ['Air-cooled', 'Water-cooled', 'Remote', 'N/A'] },
        { k: 'filterPart', label: 'Filter cartridge part #', type: 'text' },
        { k: 'filterQty', label: 'Cartridges per change', type: 'number' },
        { k: 'filterInterval', label: 'Filter change interval', type: 'select', options: ['3 months', '6 months', '12 months', 'By gallons', 'Other'] },
        { k: 'lastFilter', label: 'Last filter change', type: 'date' },
        { k: 'lastSanitize', label: 'Last clean & sanitize', type: 'date' },
      ],
    },
    {
      id: 'refrig', label: 'Refrigeration', icon: '❄️',
      types: ['Walk-in cooler', 'Walk-in freezer', 'Reach-in refrigerator', 'Reach-in freezer', 'Under-counter refrigerator', 'Milk / under-bar fridge', 'Display / pastry case', 'Grab-and-go case', 'Prep table', 'Other'],
      brands: ['True', 'Turbo Air', 'Beverage-Air', 'Traulsen', 'Hoshizaki', 'Perlick', 'Delfield', 'Atosa', 'Structural Concepts', 'Federal Industries'],
      fields: [
        { k: 'setpoint', label: 'Temp set point (°F)', type: 'text' },
        { k: 'refrigerant', label: 'Refrigerant', type: 'select', options: ['R-290', 'R-404A', 'R-134a', 'R-448A', 'R-449A', 'R-600a', 'Other'] },
        { k: 'compressor', label: 'Compressor', type: 'select', options: ['Self-contained', 'Remote', 'Unknown'] },
        { k: 'lastCoil', label: 'Last condenser coil cleaning', type: 'date' },
        { k: 'gasketCond', label: 'Door gaskets', type: 'select', options: ['Good', 'Worn', 'Needs replacement'] },
      ],
    },
    {
      id: 'hvac', label: 'HVAC', icon: '🌬️',
      types: ['Rooftop unit (RTU)', 'Split system – condenser', 'Split system – air handler', 'Ductless mini-split', 'Package unit', 'Exhaust fan', 'Make-up air unit', 'Kitchen hood', 'Thermostat', 'Air curtain', 'Other'],
      brands: ['Carrier', 'Trane', 'Lennox', 'York', 'Daikin', 'Mitsubishi', 'Rheem', 'Goodman', 'Bryant', 'LG', 'Captive-Aire', 'Greenheck', 'Ecobee', 'Honeywell', 'Nest'],
      fields: [
        { k: 'tonnage', label: 'Tonnage / BTU', type: 'text' },
        { k: 'refrigerant', label: 'Refrigerant', type: 'select', options: ['R-410A', 'R-454B', 'R-32', 'R-22', 'Other'] },
        { k: 'heat', label: 'Heat type', type: 'select', options: ['Gas', 'Electric', 'Heat pump', 'None'] },
        { k: 'filterSize', label: 'Filter size (e.g. 20x25x2)', type: 'text' },
        { k: 'filterQty', label: 'Filter qty', type: 'number' },
        { k: 'zone', label: 'Zone served', type: 'text' },
        { k: 'thermostat', label: 'Thermostat / controls', type: 'text' },
        { k: 'lastFilter', label: 'Last filter change', type: 'date' },
      ],
    },
    {
      id: 'lighting', label: 'Lighting', icon: '💡',
      types: ['Pendant', 'Recessed can / downlight', 'Track light', 'Linear / strip', 'Troffer / panel', 'Wall sconce', 'Exterior / wall pack', 'Sign lighting', 'Under-cabinet', 'String / patio lights', 'Emergency light', 'Exit sign', 'Other'],
      brands: ['Lithonia', 'Juno', 'Cooper', 'Philips', 'Halo', 'Tech Lighting', 'Visual Comfort', 'Schoolhouse', 'Lightology'],
      fields: [
        { k: 'qty', label: 'Quantity', type: 'number' },
        { k: 'lampType', label: 'Lamp / bulb type', type: 'select', options: ['LED integrated', 'LED A19', 'LED BR30', 'LED PAR', 'LED MR16', 'LED tube (T8)', 'Edison / filament', 'Fluorescent', 'Halogen', 'Other'] },
        { k: 'base', label: 'Base', type: 'select', options: ['E26', 'E12', 'GU10', 'GU5.3', 'G24', 'Pin', 'N/A'] },
        { k: 'wattage', label: 'Wattage', type: 'text' },
        { k: 'cct', label: 'Color temp', type: 'select', options: ['2200K', '2700K', '3000K', '3500K', '4000K', '5000K', 'Tunable'] },
        { k: 'dimmable', label: 'Dimmable', type: 'select', options: YESNO },
        { k: 'controls', label: 'Controls / timer / circuit', type: 'text' },
        { k: 'spareStock', label: 'Spare bulbs on hand', type: 'number' },
      ],
    },
    {
      id: 'plumbing', label: 'Plumbing', icon: '🚰',
      types: ['Water heater – tank', 'Water heater – tankless', 'Grease interceptor / trap', 'Hand sink', '3-compartment sink', 'Prep sink', 'Mop / service sink', 'Dipper well', 'Floor sink / drain', 'Backflow preventer', 'Main water shutoff', 'Gas shutoff', 'Booster pump', 'Other'],
      brands: ['A.O. Smith', 'Rheem', 'Bradford White', 'Rinnai', 'Navien', 'Noritz', 'Zurn', 'Watts', 'Febco', 'Wilkins', 'T&S Brass', 'Chicago Faucets', 'Krowne'],
      fields: [
        { k: 'size', label: 'Size / capacity', type: 'text', placeholder: 'e.g. 50 gal, 199k BTU, 40 GPM' },
        { k: 'fuel', label: 'Fuel', type: 'select', options: ['Gas', 'Electric', 'N/A'] },
        { k: 'shutoff', label: 'Shutoff valve location', type: 'text', full: true },
        { k: 'lastPump', label: 'Last pump-out / flush', type: 'date' },
        { k: 'pumpInterval', label: 'Pump-out / flush interval', type: 'select', options: ['Weekly', 'Monthly', 'Quarterly', 'Semi-annual', 'Annual', 'N/A'] },
        { k: 'backflowTest', label: 'Last backflow test', type: 'date' },
      ],
    },
    {
      id: 'restroom', label: 'Restrooms', icon: '🚻',
      types: ['Single-occupant restroom', 'Multi-stall restroom', 'Toilet', 'Urinal', 'Lavatory / sink', 'Faucet', 'Hand dryer', 'Paper towel dispenser', 'Soap dispenser', 'Baby changing station', 'Grab bars', 'Exhaust fan', 'Partition', 'Other'],
      brands: ['Kohler', 'American Standard', 'Toto', 'Sloan', 'Zurn', 'Dyson', 'Xlerator', 'Excel Dryer', 'Bobrick', 'Koala Kare', 'GOJO', 'Georgia-Pacific', 'Tork'],
      fields: [
        { k: 'ada', label: 'ADA compliant', type: 'select', options: YESNO },
        { k: 'genderNeutral', label: 'All-gender signage (CA)', type: 'select', options: YESNO },
        { k: 'flush', label: 'Flush type', type: 'select', options: ['Flushometer', 'Tank', 'Sensor', 'N/A'] },
        { k: 'lockType', label: 'Door lock type', type: 'text' },
        { k: 'supplies', label: 'Consumable refills (part #s)', type: 'text', full: true },
      ],
    },
    {
      id: 'fire', label: 'Fire Sprinklers & Life Safety', icon: '🧯',
      types: ['Sprinkler riser', 'Fire department connection (FDC)', 'Sprinkler head zone', 'Fire extinguisher – ABC', 'Fire extinguisher – K class', 'Hood suppression system', 'Fire alarm control panel', 'Smoke / heat detector', 'Pull station', 'Horn / strobe', 'Emergency lighting', 'Exit sign', 'Knox box', 'First aid kit / AED', 'Other'],
      brands: ['Ansul', 'Amerex', 'Kidde', 'Pyro-Chem', 'Badger', 'Viking', 'Tyco', 'Reliable', 'Notifier', 'Fire-Lite', 'Simplex', 'Honeywell'],
      fields: [
        { k: 'tagNo', label: 'Inspection tag #', type: 'text' },
        { k: 'size', label: 'Size / rating', type: 'text', placeholder: 'e.g. 5 lb ABC, 6 L K-class' },
        { k: 'lastInspection', label: 'Last inspection', type: 'date' },
        { k: 'nextInspection', label: 'Next inspection due', type: 'date' },
        { k: 'inspFreq', label: 'Inspection frequency', type: 'select', options: ['Monthly', 'Quarterly', 'Semi-annual', 'Annual', '5-year', '6-year', '12-year'] },
        { k: 'lastHydro', label: 'Last hydrostatic / 5-yr test', type: 'date' },
        { k: 'monitoring', label: 'Monitoring company / acct', type: 'text' },
        { k: 'deficiencies', label: 'Open deficiencies', type: 'textarea', full: true },
      ],
    },
    {
      id: 'electrical', label: 'Electrical Panels', icon: '⚡',
      types: ['Main switchboard', 'Sub-panel', 'Lighting panel', 'Disconnect', 'Transformer', 'Meter', 'Generator / transfer switch', 'GFCI outlet', 'Timer / contactor', 'Other'],
      brands: ['Square D', 'Siemens', 'Eaton / Cutler-Hammer', 'GE', 'ABB', 'Leviton', 'Intermatic'],
      fields: [
        { k: 'panelId', label: 'Panel ID / label', type: 'text' },
        { k: 'location', label: 'Physical location', type: 'text' },
        { k: 'amps', label: 'Amperage', type: 'select', options: ['60A', '100A', '125A', '150A', '200A', '225A', '400A', '600A', 'Other'] },
        { k: 'voltage', label: 'Voltage', type: 'select', options: ['120/240V 1Ø', '120/208V 3Ø', '277/480V 3Ø', 'Other'] },
        { k: 'meterNo', label: 'Utility meter #', type: 'text' },
        { k: 'directory', label: 'Circuit directory (breaker → load)', type: 'textarea', full: true, placeholder: '1 – Espresso machine\n3 – Grinders\n5 – Ice machine…' },
      ],
    },
    {
      id: 'doors', label: 'Doors & Locks', icon: '🚪',
      types: ['Storefront entry door', 'Rear / service door', 'Interior door', 'Restroom door', 'Office door', 'Roll-up / security gate', 'Walk-in door', 'Padlock', 'Key safe / lockbox', 'Other'],
      brands: ['Adams Rite', 'Schlage', 'Medeco', 'Yale', 'Sargent', 'Von Duprin', 'LCN', 'Norton', 'Kaba', 'Simplex', 'Lockly'],
      fields: [
        { k: 'lockType', label: 'Lock type', type: 'select', options: ['Mortise cylinder', 'Rim cylinder', 'Keypad', 'Smart lock', 'Deadbolt', 'Panic bar / exit device', 'Padlock', 'Other'] },
        { k: 'keyway', label: 'Keyway / key #', type: 'text' },
        { k: 'closer', label: 'Door closer', type: 'text' },
        { k: 'keyholders', label: 'Key holders', type: 'textarea', full: true },
        { k: 'lastRekey', label: 'Last rekey', type: 'date' },
      ],
    },
    {
      id: 'security', label: 'Alarm & Security', icon: '🚨',
      types: ['Intrusion alarm panel', 'Keypad', 'Motion sensor', 'Door contact', 'Panic button', 'CCTV / NVR', 'Camera', 'Access control', 'Monitoring service', 'Other'],
      brands: ['ADT', 'Brinks', 'Verkada', 'Vivint', 'Honeywell / Resideo', 'DSC', 'Bosch', 'Axis', 'Hikvision', 'Ring', 'Arlo'],
      fields: [
        { k: 'provider', label: 'Monitoring provider', type: 'text' },
        { k: 'account', label: 'Account #', type: 'text' },
        { k: 'monitorPhone', label: 'Monitoring phone', type: 'tel' },
        { k: 'panelLocation', label: 'Panel / NVR location', type: 'text' },
        { k: 'passcodeHint', label: 'Verbal passcode hint (no actual codes)', type: 'text' },
        { k: 'retention', label: 'Video retention (days)', type: 'text' },
      ],
    },
    {
      id: 'flooring', label: 'Flooring', icon: '🟫',
      types: ['Polished concrete', 'Sealed concrete', 'Tile – ceramic', 'Tile – porcelain', 'Quarry tile', 'Hardwood', 'Engineered wood', 'LVT / vinyl', 'Epoxy', 'Terrazzo', 'Rubber mat', 'Exterior pavers', 'Other'],
      brands: ['Daltile', 'Mohawk', 'Shaw', 'Armstrong', 'Interface', 'Mannington'],
      fields: [
        { k: 'sqft', label: 'Area (sq ft)', type: 'number' },
        { k: 'spec', label: 'Product / color spec', type: 'text' },
        { k: 'grout', label: 'Grout / sealer spec', type: 'text' },
        { k: 'supplier', label: 'Supplier', type: 'text' },
        { k: 'atticStock', label: 'Attic stock on hand', type: 'text' },
        { k: 'lastRefinish', label: 'Last refinish / reseal', type: 'date' },
      ],
    },
    {
      id: 'paint', label: 'Painting & Finishes', icon: '🎨',
      types: ['Interior wall', 'Accent wall', 'Ceiling', 'Trim / doors', 'Exterior wall', 'Mural', 'Wallpaper', 'Tile wall / backsplash', 'Other'],
      brands: ['Benjamin Moore', 'Sherwin-Williams', 'Dunn-Edwards', 'Farrow & Ball', 'Behr', 'PPG', 'Kelly-Moore'],
      fields: [
        { k: 'colorName', label: 'Color name', type: 'text' },
        { k: 'colorCode', label: 'Color code', type: 'text' },
        { k: 'sheen', label: 'Sheen', type: 'select', options: ['Flat / matte', 'Eggshell', 'Satin', 'Semi-gloss', 'Gloss'] },
        { k: 'product', label: 'Product line', type: 'text' },
        { k: 'lastPainted', label: 'Last painted', type: 'date' },
      ],
    },
    {
      id: 'ceilings', label: 'Ceilings', icon: '⬜',
      types: ['Drywall / hard lid', 'Acoustic tile (ACT)', 'Exposed structure', 'Wood slat', 'Acoustic panel / baffle', 'Other'],
      brands: ['Armstrong', 'USG', 'CertainTeed', 'Rockfon', 'Hunter Douglas'],
      fields: [
        { k: 'height', label: 'Height (ft)', type: 'text' },
        { k: 'tileSpec', label: 'Tile / panel spec', type: 'text' },
        { k: 'access', label: 'Access panels / plenum notes', type: 'textarea', full: true },
      ],
    },
    {
      id: 'glass', label: 'Windows & Glass', icon: '🪟',
      types: ['Storefront glass', 'Entry door glass', 'Window', 'Skylight', 'Pastry case glass', 'Mirror', 'Glass partition', 'Window film / graphics', 'Other'],
      brands: ['Kawneer', 'YKK AP', 'Vitro', 'Guardian', '3M (film)', 'Llumar (film)'],
      fields: [
        { k: 'dimensions', label: 'Dimensions (W × H)', type: 'text' },
        { k: 'glassType', label: 'Glass type', type: 'select', options: ['Tempered', 'Laminated', 'Insulated (IGU)', 'Annealed', 'Wired', 'Low-E', 'Unknown'] },
        { k: 'thickness', label: 'Thickness', type: 'text' },
        { k: 'film', label: 'Film / tint / graphics', type: 'text' },
        { k: 'lastCleaned', label: 'Last professional cleaning', type: 'date' },
      ],
    },
    {
      id: 'furniture', label: 'Seating, Counters & Tables', icon: '🪑',
      types: ['Chair', 'Stool', 'Bench / banquette', 'Table', 'Communal table', 'Bar counter', 'Service counter', 'Condiment station', 'Millwork / casework', 'Shelving', 'Patio furniture', 'Umbrella / heater', 'Other'],
      brands: ['Emeco', 'Hay', 'Muuto', 'Grand Rapids Chair', 'Restoration Hardware', 'Custom millwork'],
      fields: [
        { k: 'qty', label: 'Quantity', type: 'number' },
        { k: 'material', label: 'Material / top', type: 'text' },
        { k: 'finish', label: 'Finish / color spec', type: 'text' },
        { k: 'dimensions', label: 'Dimensions', type: 'text' },
        { k: 'supplier', label: 'Supplier / fabricator', type: 'text' },
      ],
    },
    {
      id: 'kitchen', label: 'Kitchen & Small Equipment', icon: '🍳',
      types: ['Convection oven', 'Combi / speed oven', 'Toaster / conveyor', 'Panini press', 'Microwave', 'Dishwasher', 'Glass washer', 'Food warmer', 'POS terminal', 'Printer', 'Other'],
      brands: ['Merrychef', 'TurboChef', 'Rational', 'Hobart', 'Jackson', 'Champion', 'Panasonic', 'Amana', 'Vulcan', 'Square', 'Toast'],
      fields: [
        { k: 'voltage', label: 'Voltage / plug', type: 'text' },
        { k: 'chemicals', label: 'Chemical supplier (dish)', type: 'text' },
      ],
    },
    {
      id: 'signage', label: 'Signage & Graphics', icon: '🪧',
      types: ['Exterior channel letters', 'Blade / projecting sign', 'Window graphics / vinyl', 'Menu board', 'Digital menu screen', 'Neon / LED sign', 'Wayfinding / ADA sign', 'Mural', 'Temporary / promo signage', 'Other'],
      brands: [],
      fields: [
        { k: 'dimensions', label: 'Dimensions', type: 'text' },
        { k: 'illuminated', label: 'Illuminated', type: 'select', options: ['Yes – LED', 'Yes – neon', 'Yes – fluorescent', 'No'] },
        { k: 'timer', label: 'Timer / photocell / circuit', type: 'text' },
        { k: 'permit', label: 'Sign permit #', type: 'text' },
        { k: 'fabricator', label: 'Fabricator / installer', type: 'text' },
        { k: 'artworkFile', label: 'Artwork file / version', type: 'text' },
        { k: 'installedDate', label: 'Installed', type: 'date' },
      ],
    },
    {
      id: 'cleaning', label: 'Cleaning & Janitorial', icon: '🧽',
      types: ['Janitorial service contract', 'Floor care (strip / wax / scrub)', 'Window cleaning contract', 'Hood / duct cleaning', 'Pressure washing', 'Carpet / upholstery', 'Mat service', 'Chemical dispenser', 'Other'],
      brands: ['Ecolab', 'Cintas', 'Aramark', 'ABM', 'Jani-King', 'Coverall'],
      fields: [
        { k: 'frequency', label: 'Service frequency', type: 'select', options: ['Nightly', '3x / week', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'As needed'] },
        { k: 'scope', label: 'Scope of work / standards', type: 'textarea', full: true },
        { k: 'monthlyCost', label: 'Monthly cost ($)', type: 'number' },
        { k: 'lastAudit', label: 'Last cleanliness audit', type: 'date' },
      ],
    },
    {
      id: 'roof', label: 'Roof & Exterior', icon: '🏠',
      types: ['Roof membrane', 'Roof drain', 'Gutter / downspout', 'Awning', 'Exterior signage', 'Blade sign', 'Facade', 'Parking lot / striping', 'Landscaping / planter', 'Trash enclosure', 'Other'],
      brands: [],
      fields: [
        { k: 'material', label: 'Material', type: 'text' },
        { k: 'responsible', label: 'Responsibility', type: 'select', options: ['Tenant (Alfred)', 'Landlord', 'Shared', 'Unknown'] },
        { k: 'permit', label: 'Permit / sign permit #', type: 'text' },
      ],
    },
    {
      id: 'utilities', label: 'Utilities & Accounts', icon: '🔌',
      types: ['Electric', 'Gas', 'Water / sewer', 'Trash', 'Recycling / organics (SB 1383)', 'Internet / ISP', 'Phone', 'Grease recycling', 'Linen / mats', 'Other'],
      brands: ['LADWP', 'SCE', 'SoCalGas', 'PG&E', 'SDG&E', 'Pasadena Water & Power', 'Burbank Water & Power', 'Glendale Water & Power', 'Spectrum', 'AT&T', 'Cox', 'Athens Services', 'Republic Services', 'Waste Management'],
      fields: [
        { k: 'account', label: 'Account #', type: 'text' },
        { k: 'meterNo', label: 'Meter #', type: 'text' },
        { k: 'servicePhone', label: 'Service / outage phone', type: 'tel' },
        { k: 'pickup', label: 'Pickup schedule / plan', type: 'text' },
      ],
    },
    {
      id: 'pest', label: 'Pest Control', icon: '🐜',
      types: ['Service agreement', 'Bait station', 'Fly light / ILT', 'Glue board / monitor', 'Door sweep / exclusion', 'Other'],
      brands: ['Orkin', 'Terminix', 'Rentokil', 'Western Exterminator', 'Ecolab'],
      fields: [
        { k: 'frequency', label: 'Service frequency', type: 'select', options: ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
        { k: 'stationMap', label: 'Station map / numbering', type: 'text' },
      ],
    },
  ];

  // Build final field list for a category.
  function fieldsFor(cat) {
    const typeField = { k: 'type', label: 'Type', type: 'select', options: cat.types };
    return [...COMMON_TOP, typeField, ...COMMON_ID, ...cat.fields, ...COMMON_BOTTOM];
  }

  const LOCATION_FIELDS = [
    { k: 'name', label: 'Location name', type: 'text', required: true },
    { k: 'storeNo', label: 'Store #', type: 'text' },
    { k: 'region', label: 'Region', type: 'select', options: ['Los Angeles – Westside', 'Los Angeles – Central', 'Los Angeles – East', 'San Fernando Valley', 'South Bay', 'San Gabriel Valley', 'Orange County', 'San Diego', 'Bay Area', 'Other CA', 'Austin, TX'] },
    { k: 'status', label: 'Status', type: 'select', options: ['Open', 'Temporarily closed', 'Under construction', 'Coming soon', 'Renovation', 'Closed'] },
    { k: 'address', label: 'Street address', type: 'text', full: true },
    { k: 'city', label: 'City', type: 'text' },
    { k: 'zip', label: 'ZIP', type: 'text' },
    { k: 'phone', label: 'Store phone', type: 'tel' },
    { k: 'email', label: 'Store email', type: 'email' },
    { k: 'manager', label: 'Store manager', type: 'text' },
    { k: 'managerPhone', label: 'Manager phone', type: 'tel' },
    { k: 'districtManager', label: 'District / area manager', type: 'text' },
    { k: 'hours', label: 'Hours', type: 'text' },
    { k: 'sqft', label: 'Square footage', type: 'number' },
    { k: 'seats', label: 'Seat count', type: 'number' },
    { k: 'openDate', label: 'Open date', type: 'date' },
    { k: 'format', label: 'Format', type: 'select', options: ['Café', 'Café + kitchen', 'Kiosk / walk-up', 'Tea room', 'Airport concession', 'Headquarters / office', 'Warehouse', 'Other'] },
    { k: 'annualBudget', label: 'Annual R&M budget ($)', type: 'number' },
    { k: 'landlord', label: 'Landlord / property manager', type: 'text' },
    { k: 'landlordPhone', label: 'Landlord / PM phone', type: 'tel' },
    { k: 'leaseExp', label: 'Lease expiration', type: 'date' },
    { k: 'maintResp', label: 'Lease maintenance responsibilities', type: 'textarea', full: true, placeholder: 'e.g. Tenant: HVAC, plumbing to main. Landlord: roof, structure, sprinkler main.' },
    { k: 'waterShutoff', label: 'Water main shutoff location', type: 'text', full: true },
    { k: '_ph_water', label: 'Water shutoff photos & files', type: 'photos', slot: 'shutoff-water', full: true },
    { k: 'gasShutoff', label: 'Gas shutoff location', type: 'text', full: true },
    { k: '_ph_gas', label: 'Gas shutoff photos & files', type: 'photos', slot: 'shutoff-gas', full: true },
    { k: 'electricMain', label: 'Electrical main location', type: 'text', full: true },
    { k: '_ph_electric', label: 'Electrical main photos & files', type: 'photos', slot: 'shutoff-electric', full: true },
    { k: 'healthPermit', label: 'Health permit # / exp', type: 'text' },
    { k: 'accessNotes', label: 'After-hours access / parking / delivery notes', type: 'textarea', full: true },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
    { k: '_ph_store', label: 'Location photos & files', type: 'photos', slot: 'storefront', full: true },
  ];

  const TRADES = ['General contractor', 'Handyman', 'HVAC', 'Refrigeration', 'Plumbing', 'Electrical', 'Espresso / coffee equipment', 'Ice machine', 'Water filtration', 'Fire sprinkler', 'Fire extinguisher', 'Fire alarm', 'Hood cleaning', 'Hood suppression', 'Grease trap pumping', 'Backflow testing', 'Pest control', 'Locksmith', 'Glass / glazing', 'Window cleaning', 'Flooring', 'Painting', 'Roofing', 'Millwork / carpentry', 'Furniture', 'Lighting', 'Signage', 'Security / alarm', 'IT / network / POS', 'Janitorial', 'Waste / recycling', 'Landscaping', 'Utility', 'Kitchen equipment', 'Other'];

  const VENDOR_FIELDS = [
    { k: 'kind', label: 'Type', type: 'select', options: ['External vendor', 'Internal facilities team', 'Internal beverage equipment tech'], required: true },
    { k: 'company', label: 'Company / name', type: 'text', required: true },
    { k: 'trade', label: 'Primary trade', type: 'select', options: TRADES },
    { k: 'trade2', label: 'Secondary trade', type: 'select', options: TRADES },
    { k: 'contact', label: 'Contact name', type: 'text' },
    { k: 'phone', label: 'Phone', type: 'tel' },
    { k: 'emergencyPhone', label: 'After-hours / emergency', type: 'tel' },
    { k: 'email', label: 'Email', type: 'email' },
    { k: 'website', label: 'Website / portal', type: 'url' },
    { k: 'address', label: 'Address', type: 'text', full: true },
    { k: 'accountNo', label: 'Our account #', type: 'text' },
    { k: 'license', label: 'CSLB / license #', type: 'text' },
    { k: 'coiExp', label: 'COI expiration', type: 'date' },
    { k: 'w9', label: 'W-9 on file', type: 'select', options: YESNO },
    { k: 'contractExp', label: 'Contract / NTE expiration', type: 'date' },
    { k: 'nte', label: 'Not-to-exceed ($)', type: 'number' },
    { k: 'rates', label: 'Rates (hourly / trip / after-hours)', type: 'text', full: true },
    { k: 'responseTime', label: 'Response SLA', type: 'select', options: ['2 hours', '4 hours', 'Same day', 'Next day', '48 hours', 'Scheduled only'] },
    { k: 'rating', label: 'Rating', type: 'select', options: ['5 – Excellent', '4 – Good', '3 – Average', '2 – Poor', '1 – Do not use'] },
    { k: 'preferred', label: 'Preferred vendor', type: 'select', options: ['Yes', 'No'] },
    { k: 'locations', label: 'Locations served', type: 'locations', full: true },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];

  const WO_PRIORITIES = [
    { id: 'P1', label: 'P1 – Emergency', hours: 4 },
    { id: 'P2', label: 'P2 – Urgent', hours: 24 },
    { id: 'P3', label: 'P3 – Routine', hours: 24 * 7 },
    { id: 'P4', label: 'P4 – Scheduled / project', hours: 24 * 30 },
  ];
  const WO_STATUSES = ['Open', 'Assigned', 'In progress', 'On hold – parts', 'On hold – vendor', 'On hold – approval', 'Completed', 'Closed', 'Cancelled'];
  const WO_CLOSED = ['Completed', 'Closed', 'Cancelled'];

  const REPORT_ROUTES_REF = ['On-site team can fix it', 'Needs Alfred maintenance tech', 'Needs vendor service', 'Not sure – facilities decide'];
  const WO_TYPES = ['Repair', 'Emergency repair', 'Preventive maintenance', 'Inspection', 'Project / install', 'Signage install', 'New café opening', 'Renovation / remodel', 'Cleaning / janitorial', 'Replacement'];

  const WO_FIELDS = [
    { k: 'title', label: 'Problem / title', type: 'text', required: true, full: true },
    { k: 'locationId', label: 'Location', type: 'location', required: true },
    { k: 'category', label: 'System / category', type: 'category' },
    { k: 'assetId', label: 'Asset', type: 'asset' },
    { k: 'priority', label: 'Priority', type: 'select', options: WO_PRIORITIES.map(p => p.label), required: true },
    { k: 'description', label: 'Description', type: 'textarea', full: true },
    { k: '_photos', label: 'Photos & files', type: 'photos', full: true },
    { k: 'status', label: 'Status', type: 'select', options: WO_STATUSES },
    { k: 'woType', label: 'Type', type: 'select', options: WO_TYPES },
    { k: 'vendorId', label: 'Assigned to (team / vendor)', type: 'vendor' },
    { k: 'impact', label: 'Operational impact', type: 'select', options: ['None', 'Minor – workaround', 'Station / menu item down', 'Guest-facing (restroom, seating, HVAC)', 'Café closed'] },
    { k: 'reportedBy', label: 'Reported by', type: 'text' },
    { k: 'reportedDate', label: 'Reported date', type: 'date' },
    { k: 'dueDate', label: 'Due date', type: 'date' },
    { k: 'scheduledDate', label: 'Scheduled visit', type: 'date' },
    { k: 'arrivedDate', label: 'Tech on site', type: 'date' },
    { k: 'completedDate', label: 'Completed date', type: 'date' },
    { k: 'route', label: 'Handled by', type: 'select', options: REPORT_ROUTES_REF },
    { k: 'resqId', label: 'ResQ work order #', type: 'text' },
    { k: 'resqLink', label: 'ResQ link', type: 'url', placeholder: 'Paste the work order URL from ResQ' },
    { k: 'vendorTicket', label: 'Vendor ticket #', type: 'text' },
    { k: 'po', label: 'PO #', type: 'text' },
    { k: 'estimate', label: 'Estimate ($)', type: 'number' },
    { k: 'cost', label: 'Actual cost ($)', type: 'number' },
    { k: 'invoice', label: 'Invoice #', type: 'text' },
    { k: 'warranty', label: 'Warranty claim', type: 'select', options: YESNO },
    { k: 'resolution', label: 'Resolution / work performed', type: 'textarea', full: true },
  ];

  const PM_FREQS = [
    { id: 'weekly', label: 'Weekly', days: 7 },
    { id: 'biweekly', label: 'Every 2 weeks', days: 14 },
    { id: 'monthly', label: 'Monthly', months: 1 },
    { id: 'quarterly', label: 'Quarterly', months: 3 },
    { id: 'semiannual', label: 'Semi-annual', months: 6 },
    { id: 'annual', label: 'Annual', months: 12 },
    { id: '3year', label: 'Every 3 years', months: 36 },
    { id: '5year', label: 'Every 5 years', months: 60 },
  ];

  const PM_FIELDS = [
    { k: 'title', label: 'Task', type: 'text', required: true, full: true },
    { k: 'locationId', label: 'Location', type: 'location', required: true },
    { k: 'category', label: 'System / category', type: 'category' },
    { k: 'assetId', label: 'Asset (optional)', type: 'asset' },
    { k: 'frequency', label: 'Frequency', type: 'select', options: PM_FREQS.map(f => f.label), required: true },
    { k: 'vendorId', label: 'Performed by vendor', type: 'vendor' },
    { k: 'lastDone', label: 'Last completed', type: 'date' },
    { k: 'nextDue', label: 'Next due', type: 'date' },
    { k: 'procedure', label: 'Procedure / checklist', type: 'textarea', full: true },
  ];

  // Typical PM program for a café. Frequencies are common practice; confirm against
  // manufacturer manuals, NFPA / CA Title 19, local fire & health departments, and the lease.
  const PM_TEMPLATE = [
    ['Fire extinguishers – monthly visual check', 'fire', 'Monthly', 'Pressure gauge in green, pin & seal intact, accessible, initial tag.'],
    ['Fire extinguishers – annual service & tag', 'fire', 'Annual', 'Licensed CA State Fire Marshal company. 6-yr maintenance / 12-yr hydro as due.'],
    ['Hood suppression system inspection', 'fire', 'Semi-annual', 'Only if location has cooking hood. Fusible links replaced per manufacturer.'],
    ['Kitchen exhaust hood cleaning', 'hvac', 'Quarterly', 'Frequency depends on cooking volume (NFPA 96). Skip if no hood.'],
    ['Fire sprinkler inspection (NFPA 25)', 'fire', 'Quarterly', 'Quarterly/annual inspection per NFPA 25; 5-year internal per CA Title 19. Confirm landlord vs tenant responsibility.'],
    ['Fire alarm system test & inspection', 'fire', 'Annual', ''],
    ['Emergency lights & exit signs – 30-second test', 'fire', 'Monthly', 'Push test button on each fixture; annual 90-minute duration test.'],
    ['Backflow preventer test (certified tester)', 'plumbing', 'Annual', 'Submit results to water purveyor.'],
    ['Grease interceptor pump-out', 'plumbing', 'Quarterly', 'Frequency per local FOG program / city permit.'],
    ['Water heater flush & inspection', 'plumbing', 'Annual', 'Flush sediment, check T&P valve, anode as needed.'],
    ['HVAC filter replacement', 'hvac', 'Quarterly', 'Record filter size & qty on HVAC asset.'],
    ['HVAC preventive maintenance', 'hvac', 'Quarterly', 'Coils, belts, drains, refrigerant check, thermostat calibration.'],
    ['Ice machine clean & sanitize', 'icewater', 'Semi-annual', 'Descale & sanitize per manufacturer; more often in hard-water areas.'],
    ['Water filter cartridge replacement', 'icewater', 'Semi-annual', 'Espresso, brewer, and ice machine filters. Log gallons if metered.'],
    ['Espresso machine PM (gaskets, screens, valves)', 'coffee', 'Quarterly', 'Group gaskets & screens, check pressure, steam valves, pump.'],
    ['Grinder burr replacement', 'coffee', 'Annual', 'Interval depends on lbs ground; check manufacturer spec.'],
    ['Refrigeration condenser coil cleaning', 'refrig', 'Quarterly', 'All reach-ins, under-counters, display cases, walk-ins.'],
    ['Refrigeration door gasket inspection', 'refrig', 'Monthly', ''],
    ['Pest control service', 'pest', 'Monthly', 'Keep service reports on file for health inspections.'],
    ['Roof & drain inspection', 'roof', 'Semi-annual', 'Before and after rainy season. Confirm landlord responsibility.'],
    ['Electrical panel inspection / infrared scan', 'electrical', 'Annual', 'Check labeling, clearance (36"), and circuit directory accuracy.'],
    ['Restroom fixtures & ADA check', 'restroom', 'Monthly', 'Flush valves, faucets, dryers, dispensers, grab bars, signage.'],
    ['Door hardware & closer adjustment', 'doors', 'Semi-annual', 'Closers, panic hardware, locks, weatherstrip, ADA closing force.'],
    ['Alarm & camera system test', 'security', 'Quarterly', 'Test sensors with monitoring company; verify NVR recording.'],
    ['Storefront window cleaning', 'glass', 'Monthly', ''],
    ['Floor deep clean / reseal', 'flooring', 'Annual', ''],
    ['Paint touch-ups walkthrough', 'paint', 'Quarterly', ''],
    ['Furniture & seating safety check', 'furniture', 'Monthly', 'Wobbly tables, loose chair joints, sharp edges.'],
    ['Signage lighting & timer check', 'signage', 'Monthly', 'All letters lit, timer/photocell set for season, graphics not peeling.'],
    ['Janitorial / cleanliness audit', 'cleaning', 'Monthly', 'Score against Alfred cleanliness standards; review with cleaning vendor.'],
    ['Floor care – scrub / reseal', 'cleaning', 'Quarterly', ''],
  ];

  const DOC_KINDS = ['Floor plan', 'Life safety / evacuation plan', 'Reflected ceiling plan', 'Electrical plan / one-line', 'Plumbing plan', 'Mechanical / HVAC plan', 'As-built drawings', 'Equipment schedule', 'Permit', 'Certificate of occupancy', 'Health permit', 'Inspection report', 'Certificate of insurance (COI)', 'Warranty', 'Manual / spec sheet', 'Quote / proposal', 'Invoice', 'Photo', 'Document', 'Lease / landlord doc', 'SDS', 'Other'];

  // Alfred California cafés from locations.alfred.la (provided Oct 2026).
  // [name, storeNo (online-order code), address, city, zip, phone, region, format, status]
  const SEED_LOCATIONS = [
    ['Abbot Kinney', 'AK', '1653B Abbot Kinney Blvd', 'Venice', '90291', '(424) 390-7200', 'Los Angeles – Westside'],
    ['Arts District', 'AD', '714 Traction Ave', 'Los Angeles', '90013', '(213) 770-5006', 'Los Angeles – Central'],
    ['Beverly & Martel', 'BAM', '7386 Beverly Blvd', 'Los Angeles', '90036', '(424) 476-0004', 'Los Angeles – Central'],
    ['Beverly Hills', 'BH', '490 N Beverly Dr', 'Beverly Hills', '90210', '(424) 346-6200', 'Los Angeles – Westside'],
    ['Brentwood', 'BW', '11908 San Vicente Blvd', 'Los Angeles', '90049', '(310) 340-0094', 'Los Angeles – Westside'],
    ['Burbank', 'BUR', '171 N Maple St', 'Burbank', '91505', '(818) 650-3020', 'San Fernando Valley'],
    ['Canon Drive', 'CAN', '319 N Canon Dr', 'Beverly Hills', '90210', '(424) 544-5100', 'Los Angeles – Westside'],
    ['Coldwater', 'CW', '12930 Ventura Blvd #122', 'Studio City', '91604', '(818) 853-9200', 'San Fernando Valley'],
    ['Encino', 'ENC', '16911 Ventura Blvd', 'Los Angeles', '91316', '(818) 938-2002', 'San Fernando Valley'],
    ['Highland Park', 'HP', '5815 N Figueroa St', 'Los Angeles', '90042', '(323) 458-5444', 'Los Angeles – East'],
    ['Koreatown', 'KT', '3515 Wilshire Blvd', 'Los Angeles', '90010', '(213) 510-2700', 'Los Angeles – Central'],
    ['LAX', 'LAX', '1 World Way, Los Angeles International Airport', 'Los Angeles', '90045', '(310) 780-8562', 'South Bay', 'Airport concession'],
    ['Malibu', 'MA', '3835 Cross Creek Rd #7', 'Malibu', '90265', '(424) 320-5900', 'Los Angeles – Westside'],
    ['Marina del Rey', 'MDR', '4625 Admiralty Way #107', 'Marina del Rey', '90292', '(310) 388-8040', 'Los Angeles – Westside'],
    ['Melrose Place', 'MP', '8428 Melrose Pl', 'Los Angeles', '90069', '(323) 870-1100', 'Los Angeles – Central'],
    ['Palisades Village', 'PV', '15217 Palisades Village Ln', 'Pacific Palisades', '90272', '(424) 364-2500', 'Los Angeles – Westside'],
    ['Pasadena', 'PA', '55 W Colorado Blvd', 'Pasadena', '91101', '(626) 790-7020', 'San Gabriel Valley'],
    ['Porter Ranch', 'PR', '20140 Rinaldi St Suite 130', 'Porter Ranch', '91326', '(818) 646-5396', 'San Fernando Valley'],
    ['Robertson', 'RO', '320 S Robertson Blvd', 'Los Angeles', '90048', '(424) 300-4080', 'Los Angeles – Central'],
    ['Sawtelle', 'SAW', '11301 W Olympic Blvd #120', 'Los Angeles', '90064', '(310) 510-6265', 'Los Angeles – Westside'],
    ['Silverlake', 'SL', '3337 1/2 Sunset Blvd', 'Los Angeles', '90026', '(323) 870-9800', 'Los Angeles – East'],
    ['Topanga Village', 'TV', '6316 Topanga Canyon Blvd #1100', 'Woodland Hills', '91367', '(747) 222-1200', 'San Fernando Valley'],
    ['Ventura Place', 'VP', '12077 Ventura Pl', 'Studio City', '91604', '(818) 960-1020', 'San Fernando Valley'],
    ['Westwood', 'WW', '1154 Westwood Blvd', 'Los Angeles', '90024', '(424) 404-1700', 'Los Angeles – Westside'],
    ['Calabasas (new build)', 'CAL', '', 'Calabasas', '', '', 'San Fernando Valley', 'Café', 'Under construction'],
    ['Alfred HQ', 'HQ', '708 N Croft Ave', 'Los Angeles', '90069', '', 'Los Angeles – Central', 'Headquarters / office'],
    ['Warehouse', 'WH', '6711 Odessa Ave', 'Van Nuys', '91406', '', 'San Fernando Valley', 'Warehouse'],
  ];
  // Default photos (img/locations/<storeNo>.jpg): cafés from locations.alfred.la, plus HQ and warehouse. Shown until a team photo is added.
  const SITE_PHOTOS = ['ak', 'ad', 'bam', 'bh', 'bw', 'bur', 'can', 'cw', 'enc', 'hp', 'kt', 'lax', 'ma', 'mdr', 'mp', 'pv', 'pa', 'pr', 'ro', 'saw', 'sl', 'tv', 'vp', 'ww', 'hq', 'wh'];

  // Names used by the earlier guessed starter list → real café names.
  const SEED_ALIASES = { 'Alfred – Silver Lake': 'Silverlake', 'Alfred – Downtown LA': 'Arts District', 'Alfred – Studio City': 'Ventura Place' };

  // Site-visit walkthrough checklist: [area, item, category id for any resulting work order]
  const VISIT_CHECKLIST = [
    ['Exterior', 'Signage lit, clean, undamaged', 'signage'],
    ['Exterior', 'Storefront glass & entry clean', 'glass'],
    ['Exterior', 'Entry door, closer & hardware working', 'doors'],
    ['Exterior', 'Patio furniture, umbrellas, heaters', 'furniture'],
    ['Exterior', 'Trash / recycling area clean', 'utilities'],
    ['Front of house', 'Floors clean, no damage or trip hazards', 'flooring'],
    ['Front of house', 'Walls & paint – no scuffs / damage', 'paint'],
    ['Front of house', 'All lights working', 'lighting'],
    ['Front of house', 'Seating & tables stable and clean', 'furniture'],
    ['Front of house', 'Ceiling – no stains, missing tiles', 'ceilings'],
    ['Front of house', 'HVAC – temperature comfortable, no noise / drips', 'hvac'],
    ['Bar', 'Espresso machine – pressure, temps, no leaks', 'coffee'],
    ['Bar', 'Grinders & brewers working', 'coffee'],
    ['Bar', 'Ice machine clean & producing', 'icewater'],
    ['Bar', 'Water filters within change date', 'icewater'],
    ['Bar', 'Refrigeration holding temp (≤ 41°F)', 'refrig'],
    ['Bar', 'Sinks & dipper well draining, no leaks under counter', 'plumbing'],
    ['Back of house', 'Hand sinks: hot water, soap, towels', 'plumbing'],
    ['Back of house', 'Floor drains / floor sinks clear', 'plumbing'],
    ['Back of house', 'Walk-in / reach-in gaskets & doors', 'refrig'],
    ['Back of house', 'No pest activity', 'pest'],
    ['Back of house', 'Storage tidy, 18" clear below sprinklers', 'fire'],
    ['Restrooms', 'Toilets, sinks, faucets working', 'restroom'],
    ['Restrooms', 'Clean, stocked, dryers / dispensers working', 'restroom'],
    ['Restrooms', 'ADA grab bars, signage, lock', 'restroom'],
    ['Life safety', 'Extinguishers charged, tagged, accessible', 'fire'],
    ['Life safety', 'Exit signs & emergency lights working', 'fire'],
    ['Life safety', 'Exits & egress paths clear', 'fire'],
    ['Life safety', 'Electrical panels labeled, 36" clearance', 'electrical'],
    ['Cleanliness', 'Overall cleanliness meets Alfred standard', 'cleaning'],
  ];


  // ----- QR "report a problem" flow -----
  const REPORT_PROBLEMS = {
    coffee: ['Not heating / low temperature', 'Low or no pressure', 'Leaking water', 'Steam wand not working', 'Grinder jammed / not grinding', 'Inconsistent dose / grind', 'Error code on display', "Won't power on", 'Strange noise'],
    icewater: ['Not making ice', 'Ice tastes or smells off', 'Leaking water', 'Filter light on / filter due', 'Low water flow', 'Bin not filling / overflowing'],
    refrig: ['Not cold enough (above 41°F)', 'Freezing product', 'Door not closing / sealing', 'Leaking water', 'Loud or unusual noise', 'Not running'],
    hvac: ['Too hot', 'Too cold', 'Not turning on', 'Leaking / dripping', 'Bad smell', 'Loud noise', 'Thermostat blank'],
    lighting: ['Light out', 'Flickering', 'Fixture damaged / hanging', 'Timer wrong (on/off at wrong time)'],
    plumbing: ['Clogged / slow drain', 'Leaking', 'No hot water', 'Running water / won\'t shut off', 'Backup / overflow', 'Bad sewer smell'],
    restroom: ['Toilet clogged', 'Toilet running / won\'t flush', 'Sink / faucet issue', 'Hand dryer not working', 'Dispenser broken', 'Lock / door issue', 'Leak on floor'],
    fire: ['Extinguisher used / missing / low', 'Exit sign or emergency light out', 'Fire alarm trouble light / beeping', 'Sprinkler head damaged or leaking', 'Hood system issue', 'Blocked exit'],
    electrical: ['Breaker tripped', 'Outlet not working', 'Burning smell / sparking', 'Power out to equipment', 'Panel label missing'],
    doors: ["Won't lock / unlock", 'Key stuck or broken', 'Door not closing', 'Closer slamming', 'Hardware loose', 'Gate / roll-up stuck'],
    security: ['Alarm won\'t arm / disarm', 'Camera offline', 'False alarm', 'Keypad not working'],
    signage: ['Sign not lighting', 'Letters / section out', 'Damaged / peeling', 'Timer wrong'],
    furniture: ['Wobbly / unstable', 'Broken / cracked', 'Loose part', 'Finish damaged'],
    glass: ['Cracked / broken glass', 'Film / graphics peeling', 'Won\'t open / close'],
  };
  const REPORT_PROBLEMS_DEFAULT = ['Not working', 'Damaged / broken', 'Leaking', 'Loose / unstable', 'Needs cleaning', 'Missing'];

  const REPORT_IMPACT = ['Still working – minor issue', 'Partially working', 'Down – not usable', 'Safety hazard (leak, sparks, smell, injury risk)'];
  const REPORT_ROUTES = REPORT_ROUTES_REF;

  // Safe first steps a café team can try before calling for service.
  const SELF_FIX_TIPS = {
    coffee: ['Check the machine is switched on and its breaker is not tripped.', 'Make sure the water supply valve under the counter is open.', 'Backflush the groups with cleaner per the closing checklist.', 'Power-cycle: switch off, wait 30 seconds, switch on, and allow 15–20 minutes to heat.', 'Grinders: clear the chute, check the hopper gate is open and the burr-adjust collar has not moved.'],
    icewater: ['Check the machine is on and the water valve is open.', 'Make sure the bin is not full or the ice is not bridged over the sensor.', 'Check nothing is blocking the air vents (air-cooled units need clearance).', 'Do not change filters or open panels unless you are trained.'],
    refrig: ['Close the door fully – check nothing is stopping it from sealing.', 'Check the temperature setting has not been changed.', 'Clear any boxes blocking the vents / fan inside.', 'Make sure it is plugged in and not overloaded with warm product.', 'Move product to another unit if it is above 41°F.'],
    hvac: ['Check the thermostat mode (cool / heat / auto) and set point.', 'Replace thermostat batteries if the display is blank.', 'Make sure supply and return vents are not blocked.', 'Check the breaker for the unit.'],
    lighting: ['Check the switch and any timer / photocell setting.', 'Replace the bulb with a spare of the same type (see equipment spec).', 'Do not open fixtures or touch wiring.'],
    plumbing: ['Use a plunger on clogged sinks / drains.', 'For leaks: close the shutoff valve under the fixture and put a bucket down.', 'Never use chemical drain cleaner on grease lines.', 'No hot water: check the water heater has power / pilot.'],
    restroom: ['Plunge a clogged toilet.', 'Jiggle the flush handle; for flush valves, check the side stop is open.', 'Refill dispensers and check batteries in automatic units.', 'Put out a wet-floor sign for any leak.'],
    fire: ['Do NOT silence, reset or tamper with fire systems – report immediately.', 'Keep exits and extinguishers clear and accessible.', 'If there is fire, smoke or an alarm: evacuate and call 911.'],
    electrical: ['You may reset a tripped breaker ONCE.', 'If it trips again, or there is a burning smell or sparking: stop, unplug if safe, and report as a safety hazard.', 'Never open the panel cover or touch wiring.'],
    doors: ['Check the strike plate and that the door is fully closed before locking.', 'Do not force a stuck key – it may break in the lock.', 'Keep the door secured and notify the manager on duty if it will not lock.'],
    security: ['Check all doors and windows are fully closed before arming.', 'Use the keypad instructions to clear the last alarm, then try again.', 'Call the monitoring company if you cannot disarm.'],
  };
  const SELF_FIX_DEFAULT = ['Check it is plugged in, switched on, and the breaker is not tripped.', 'Turn it off and on again.', 'Check for anything blocking or jammed.', 'Clean it per the daily checklist.'];

  window.SCHEMA = {
    AREAS, CONDITION, STATUS, CATEGORIES, fieldsFor, LOCATION_FIELDS, TRADES, VENDOR_FIELDS,
    WO_PRIORITIES, WO_STATUSES, WO_CLOSED, WO_FIELDS, PM_FREQS, PM_FIELDS, PM_TEMPLATE,
    DOC_KINDS, SEED_LOCATIONS, SEED_ALIASES, SITE_PHOTOS, VISIT_CHECKLIST, WO_TYPES,
    REPORT_PROBLEMS, REPORT_PROBLEMS_DEFAULT, REPORT_IMPACT, REPORT_ROUTES, SELF_FIX_TIPS, SELF_FIX_DEFAULT,
    catById: id => CATEGORIES.find(c => c.id === id),
  };
})();
