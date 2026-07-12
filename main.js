// initialize info modal and show it on pageload
const modal = new bootstrap.Modal(document.getElementById('infoModal'));
modal.show();

// initialize the leaflet map
const map = L.map('map', { "tap": false }).setView([54.916, -125.701], 6);

const MAPBOX_TILE_OPTIONS = {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoibmdvdHRsaWViIiwiYSI6ImNrcGtlc2J5eDFodGwybm85bWR4Mjd5cncifQ.fCXujwpKwP1mbLXC2hklkw'
};
const MAPBOX_TILE_URL = 'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}';

const terrainLayer = L.tileLayer(MAPBOX_TILE_URL, { ...MAPBOX_TILE_OPTIONS, id: 'mapbox/streets-v11' });
const satelliteLayer = L.tileLayer(MAPBOX_TILE_URL, { ...MAPBOX_TILE_OPTIONS, id: 'mapbox/satellite-streets-v11' });
terrainLayer.addTo(map);

L.control.layers({
  'Terrain': terrainLayer,
  'Satellite': satelliteLayer
}, null, { position: 'topleft' }).addTo(map);

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
// ranks of ALL trees, including those without published coordinates,
// so the top-N note can report how many of the top N aren't mappable
const allTreeRanks = [];

// Species filter control
const speciesFilter = L.control({ position: 'topright' });
speciesFilter.onAdd = function(map) {
  const div = L.DomUtil.create('div', 'species-filter');
  div.innerHTML = `
    <div class="species-filter-header">
      <label for="speciesSelect"><strong>Filter by Species</strong></label>
      <button id="speciesFilterToggleBtn" type="button" class="species-filter-toggle-btn" aria-label="Hide filter controls" aria-expanded="true">Hide</button>
    </div>
    <div class="species-filter-body">
      <select id="speciesSelect" class="form-select form-select-sm">
        <option value="">All Species</option>
      </select>
      <select id="topNSelect" class="form-select form-select-sm mt-2" aria-label="Limit to top-ranked trees">
        <option value="">All trees</option>
        <option value="10">Top 10 per species</option>
        <option value="30">Top 30 per species</option>
      </select>
      <div id="topNNote" class="top-n-note" role="status"></div>
    </div>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
speciesFilter.addTo(map);
initSpeciesFilterMobileToggle();

// load CSV data
// NOTE: thought about loading this directly from the BCBT website,
// but it has CORS protection *and* the filename changes every time the registry is updated
// which is just a few times a year. So figured it's really not a big issue to just
// update the repository with a new file every time the registry is re-published.
Papa.parse('data/BCBT_Mar_24_2026.csv', {
  download: true,
  header: true,
  complete: function(results) {
    addResultsToMap(results);
  }
});

function addResultsToMap(results) {
  results.data.forEach(function(x) {
    allTreeRanks.push({ species: x.common_name || '', rank: parseTreeRank(x.rank) });
    createMarker(x);
  });

  // Populate species dropdown with sorted unique species names
  const sortedSpecies = [...allSpecies].sort();
  const select = document.getElementById('speciesSelect');
  const topNSelect = document.getElementById('topNSelect');
  sortedSpecies.forEach(function(species) {
    const option = document.createElement('option');
    option.value = species;
    option.textContent = formatSpeciesDisplayName(species);
    select.appendChild(option);
  });

  function applyFilters() {
    const topN = Number.parseInt(topNSelect.value, 10);
    const visibleMarkerItems = getVisibleMarkerItems(select.value, topN);
    const visibleMarkers = visibleMarkerItems.map(function(item) {
      return item.marker;
    });

    markerCluster.clearLayers();
    markerCluster.addLayers(visibleMarkers);

    updateTopNNote(topN, select.value, visibleMarkers.length);

    const bounds = L.featureGroup(visibleMarkers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2), { maxZoom: 13 });
    }
  }

  select.addEventListener('change', applyFilters);
  topNSelect.addEventListener('change', applyFilters);
}

function updateTopNNote(topN, selectedSpecies, shownCount) {
  const note = document.getElementById('topNNote');
  if (!Number.isFinite(topN)) {
    note.textContent = '';
    return;
  }

  const totalRanked = allTreeRanks.filter(function(t) {
    return (!selectedSpecies || t.species === selectedSpecies) && t.rank !== null && t.rank <= topN;
  }).length;

  if (shownCount < totalRanked) {
    const hiddenCount = totalRanked - shownCount;
    note.textContent = `Showing ${shownCount} of ${totalRanked} — ${hiddenCount} ` +
      `${hiddenCount === 1 ? 'has a' : 'have'} hidden or unpublished location${hiddenCount === 1 ? '' : 's'}.`;
  } else {
    note.textContent = '';
  }
}

function getVisibleMarkerItems(selectedSpecies, topN) {
  return allMarkers.filter(function(item) {
    if (selectedSpecies && item.species !== selectedSpecies) {
      return false;
    }
    if (Number.isFinite(topN)) {
      return item.rank !== null && item.rank <= topN;
    }
    return true;
  });
}

function initSpeciesFilterMobileToggle() {
  const filterPanel = document.querySelector('.species-filter');
  const toggleBtn = document.getElementById('speciesFilterToggleBtn');
  if (!filterPanel || !toggleBtn) {
    return;
  }

  L.DomEvent.disableClickPropagation(toggleBtn);
  L.DomEvent.disableScrollPropagation(toggleBtn);

  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function funnelIconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor"></path></svg>';
  }

  function setCollapsed(collapsed) {
    filterPanel.classList.toggle('mobile-collapsed', collapsed);
    if (collapsed && isMobileViewport()) {
      toggleBtn.classList.add('compact');
      toggleBtn.innerHTML = funnelIconMarkup();
    } else {
      toggleBtn.classList.remove('compact');
      toggleBtn.textContent = 'Hide';
    }
    toggleBtn.setAttribute('aria-label', collapsed ? 'Show filter box' : 'Hide filter box');
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  }

  toggleBtn.addEventListener('click', function() {
    if (!isMobileViewport()) {
      return;
    }
    const isCollapsed = filterPanel.classList.contains('mobile-collapsed');
    setCollapsed(!isCollapsed);
  });

  window.addEventListener('resize', function() {
    if (!isMobileViewport()) {
      setCollapsed(false);
    }
  });

  setCollapsed(false);
}

// rank is the registry's official per-species ranking; non-numeric values
// ("multi" for multi-stemmed trees, or blank) mean the tree is unranked
function parseTreeRank(rankRaw) {
  const parsed = Number.parseInt(String(rankRaw || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

  allMarkers.push({
    marker: marker,
    species: tree.common_name || '',
    rank: parseTreeRank(tree.rank)
  });

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

function extractPhotoUrls(photoLinkHTML) {
  return [...String(photoLinkHTML || '').matchAll(/href="([^"]+)"/g)]
    .map(function(match) {
      return match[1];
    });
}

function popupHTML(tree) {
  var output = "<dl>";
  const attrs = {
    "Tree": "common_name",
    "ID #": "tree_registry_id",
    "Nickname": "tree_nickname",
    "Rank": "rank",
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
    const attrKey = attrs[key];
    const val = tree[attrKey];

    if (val) {
      let displayVal = val;
      if (attrKey === 'common_name') {
        displayVal = formatSpeciesDisplayName(val);
      } else if (attrKey === 'rank' && val.trim() === 'multi') {
        displayVal = 'n/a (multi-stemmed)';
      }
      output += `<dt>${key}</dt><dd>${displayVal}</dd>\n`;
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

  // add photo thumbnails if present; each links to the full-size image
  if (parseInt(tree.has_photo)) {
    const photoUrls = extractPhotoUrls(tree['all photo LINK']);
    if (photoUrls.length) {
      const thumbnails = photoUrls.map(function(url) {
        return `<a href="${url}" target="_blank"><img src="${url}" loading="lazy" alt="Photo of this tree" /></a>`;
      }).join('');
      output += `<dt>Photos</dt><dd class="popup-photos">${thumbnails}</dd>`;
    } else if ((tree['all photo LINK'] || '').trim()) {
      // fall back to the raw links if the photo HTML doesn't match the expected format
      output += `<dt>Photos</dt><dd>${tree['all photo LINK']}</dd>`;
    }
  }

  output += "</dl>";
  return output;
}
