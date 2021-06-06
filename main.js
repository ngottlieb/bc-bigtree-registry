const map = L.map('map').setView([54.916, -125.701], 6);

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoibmdvdHRsaWViIiwiYSI6ImNrcGtlc2J5eDFodGwybm85bWR4Mjd5cncifQ.fCXujwpKwP1mbLXC2hklkw'
}).addTo(map);

Papa.parse('BCBT_conifers_032021.csv', {
  download: true,
  header: true,
  complete: addResultsToMap
});

function addResultsToMap(results) {
  results.data.forEach(createMarker);
}

function createMarker(tree) {
  if (tree.latitude && tree.longitude) {
    const marker = L.marker([tree.latitude, tree.longitude]);
    marker.addTo(map);
    marker.bindPopup(popupHTML(tree));
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

var modal = new bootstrap.Modal(document.getElementById('infoModal'));
modal.show();