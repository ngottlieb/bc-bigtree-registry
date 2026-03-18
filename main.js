// initialize info modal and show it on pageload
const modal = new bootstrap.Modal(document.getElementById('infoModal'));
modal.show();

// initialize the leaflet map
const map = L.map('map', { "tap": false }).setView([54.916, -125.701], 6);

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoibmdvdHRsaWViIiwiYSI6ImNrcGtlc2J5eDFodGwybm85bWR4Mjd5cncifQ.fCXujwpKwP1mbLXC2hklkw'
}).addTo(map);

const legend = L.control({position: 'bottomright'});
legend.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <img src="conifer.png" alt="An icon representing conifer trees" /><h6>Conifers</h6>
    <br />
    <img src="broadleaf.png" alt="An icon representing broadleaf trees" /><h6>Broadleaves</h6>
  `;
  return div;
}
legend.addTo(map);

const infoButton = L.control({ position: 'bottomright' });
infoButton.onAdd = function (map) {
  const div = L.DomUtil.create('div', 'info-button-container');
  div.innerHTML = `<button class="btn btn-primary info" data-bs-toggle="modal" data-bs-target="#infoModal">More Info</button>`;
  return div;
}
infoButton.addTo(map);

const TreeIcon = L.Icon.extend({
  options: {
    iconSize: [38, 38]
  }
});

const coniferIcon = new TreeIcon({
  iconUrl: 'conifer.png'
});

const broadleafIcon = new TreeIcon({
  iconUrl: 'broadleaf.png'
});

const markerCluster = L.markerClusterGroup({
  disableClusteringAtZoom: 14,
  maxClusterRadius: 55,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  chunkedLoading: true
});
map.addLayer(markerCluster);

const BC_COORD_BOUNDS = {
  minLat: 47,
  maxLat: 61,
  minLng: -141,
  maxLng: -110
};

// Store all markers with their species name for filtering
const allMarkers = [];
const allSpecies = new Set();

// Species filter control
const speciesFilter = L.control({ position: 'topright' });
speciesFilter.onAdd = function(map) {
  const div = L.DomUtil.create('div', 'species-filter');
  div.innerHTML = `
    <label for="speciesSelect"><strong>Filter by Species</strong></label>
    <select id="speciesSelect" class="form-select form-select-sm">
      <option value="">All Species</option>
    </select>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
speciesFilter.addTo(map);

// load CSV data
// NOTE: thought about loading this directly from the BCBT website,
// but it has CORS protection *and* the filename changes every time the registry is updated
// which is just a few times a year. So figured it's really not a big issue to just
// update the repository with a new file every time the registry is re-published.
Papa.parse('data/BCBT_Jan_5_2026.csv', {
  download: true,
  header: true,
  complete: function(results) {
    addResultsToMap(results);
  }
});

function addResultsToMap(results) {
  results.data.forEach(function(x) { createMarker(x) });

  // Populate species dropdown with sorted unique species names
  const sortedSpecies = [...allSpecies].sort();
  const select = document.getElementById('speciesSelect');
  sortedSpecies.forEach(function(species) {
    const option = document.createElement('option');
    option.value = species;
    option.textContent = formatSpeciesDisplayName(species);
    select.appendChild(option);
  });

  select.addEventListener('change', function() {
    const visibleMarkers = getVisibleMarkers(this.value);
    markerCluster.clearLayers();
    markerCluster.addLayers(visibleMarkers);

    const bounds = L.featureGroup(visibleMarkers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2), { maxZoom: 13 });
    }
  });
}

function getVisibleMarkers(selectedSpecies) {
  return allMarkers
    .filter(function(item) {
      return !selectedSpecies || item.species === selectedSpecies;
    })
    .map(function(item) {
      return item.marker;
    });
}

function formatSpeciesDisplayName(species) {
  const hasCoastalMarker = species.includes('*');
  const hasInteriorMarker = species.includes('^');

  const baseName = species
    .replace(/[*^]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, function(letter) {
      return letter.toUpperCase();
    });

  if (hasInteriorMarker) {
    return `${baseName} (interior)`;
  }
  if (hasCoastalMarker) {
    return `${baseName} (coastal)`;
  }
  return baseName;
}

function createMarker(tree) {
  const latLng = getValidTreeLatLng(tree);
  if (!latLng) {
    return;
  }

  const marker = L.marker(
    latLng,
    {
      icon: tree.tree_type === 'c' ? coniferIcon : broadleafIcon
    }
  );
  markerCluster.addLayer(marker);
  marker.bindPopup(popupHTML(tree), { maxHeight: 400 });

  allMarkers.push({ marker: marker, species: tree.common_name || '' });

  if (tree.common_name) {
    allSpecies.add(tree.common_name);
  }
}

function getValidTreeLatLng(tree) {
  const lat = Number(tree.latitude);
  let lng = Number(tree.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // Correct obvious hemisphere sign typos in BC data (e.g. 121.x should be -121.x).
  if (lng > 0 && lng >= Math.abs(BC_COORD_BOUNDS.maxLng) && lng <= Math.abs(BC_COORD_BOUNDS.minLng)) {
    lng = -lng;
  }

  if (lat < BC_COORD_BOUNDS.minLat || lat > BC_COORD_BOUNDS.maxLat) {
    return null;
  }
  if (lng < BC_COORD_BOUNDS.minLng || lng > BC_COORD_BOUNDS.maxLng) {
    return null;
  }

  return [lat, lng];
}

function popupHTML(tree) {
  var output = "<dl>";
  const attrs = {
    "Tree": "common_name",
    "ID #": "tree_registry_id",
    "Nickname": "tree_nickname",
    "Score": "tree_score",
    "Height": "height_(m)",
    "DBH": "DBH_(m)",
    "Crown Spread": "crown_spread_(m)",
    "Last Measured": "last_measured",
    "Location": "location",
    "Nearest Town": "nearest_town",
    "Land Status": "ownership",
    "Details": "ownership_details",
    "Elevation": "elevation_m",
    "Access": "access_notes",
    "Additional info": "tree_site_notes"
  };

  for (const key in attrs) {
    if (!attrs.hasOwnProperty(key)) {
      next;
    }
    const val = tree[attrs[key]];

    if (val) {
      output += `<dt>${key}</dt><dd>${val}</dd>\n`;
    }
  }

  // add lat/lng as a single field
  const lat = tree['latitude'];
  const lng = tree['longitude'];
  if (lat.length && lng.length) {
    output += `
      <dt>Lat/lng</dt>
      <dd>
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}">${lat},${lng}</a>
      </dd>`;
  }

  // add photo links if present
  if (parseInt(tree.has_photo)) {
    output += `
      <dt>Photos</dt>
      <dd>${tree['all photo LINK']}</dd>
    `;
  }

  output += "</dl>";
  return output;
}
