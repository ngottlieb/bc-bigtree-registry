// initialize info modal and show it on pageload
const modal = new bootstrap.Modal(document.getElementById('infoModal'));
modal.show();

// initialize the leaflet map
const map = L.map('map').setView([54.916, -125.701], 6);

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



// load CSV data
Papa.parse('BCBT_broadleaves_March_2021.csv', {
  download: true,
  header: true,
  complete: function(results) {
    addResultsToMap(results, "broadleaf")
  }
});

Papa.parse('BCBT_conifers_March_2021.csv', {
  download: true,
  header: true,
  complete: function(results) {
    addResultsToMap(results, "conifer")
  }
});

function addResultsToMap(results, treeType) {
  results.data.forEach(function(x) { createMarker(x, treeType) });
}

function createMarker(tree, treeType) {
  if (tree.latitude && tree.longitude) {
    const marker = L.marker(
      [tree.latitude, tree.longitude],
      {
        icon: treeType === 'conifer' ? coniferIcon : broadleafIcon
      }
    );
    marker.addTo(map);
    marker.bindPopup(popupHTML(tree), { maxHeight: 400 });
  }
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
  output += "</dl>";
  return output;
}
