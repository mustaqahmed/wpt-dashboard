let config = {
  // How often query the test results from wpt.fyi
  // There is about one new run per hour on average.
  update_period: 1, // in hour

  // How many recent test runs to fetch for history.
  // Every run data takes about a second to fetch.
  history_count: 100,
};

/*
 test_data is a list of test results per run which will be used for visualization.
 The timestamp is in increasing order and hence the newest entry is the lst entry.
 Each element is a dict of:
 {
   timestamp: 1587575389784,
   id: 123,
   folders: {
      folder1: { passing: 10, total: 20 },
      folder2: { passing: 20, total: 30 },
   }
 }
*/
let test_data = [];

/*
  Populated using this bash command at chromium src/:

  find third_party/blink/web_tests/external/wpt -name OWNERS | \
    xargs grep --files-with-matches input-dev@ | \
    sed -e 's|third_party/blink/web_tests/external/wpt/|  "|' -e 's|/OWNERS$|",|' | \
    sort

  TODO: automatically pull from http://cs.chromium.org/.
*/
let wpt_test_folders = [
  "dom/events/scrolling",
  "html/interaction/focus",
  "html/user-activation",
  "infrastructure/testdriver/actions",
  "input-events",
  "keyboard-map",
  "pointerevents",
  "pointerlock",
  "scroll-to-text-fragment",
  "touch-events",
  "uievents",
  "visual-viewport",
];

async function fetchWptRawData(query) {
  const url_prefix = 'https://staging.wpt.fyi/api/';

  let raw_data = await fetch(url_prefix + query)
  .then((response) => {
    return response.json();
  })
  .then((data) => {
    return data;
  });

  return raw_data;
}

async function fetchTestResultsOfFolder(run_id, wpt_folder) {
  let raw_data = await fetchWptRawData('search?run_ids=' + run_id + '&q=' + wpt_folder);

  let num_total = 0;
  let num_passing = 0;

  for (let result of raw_data.results) {
    let status = result.legacy_status[0];
    num_passing += status.passes;
    num_total += status.total;
  }

  return {
    passing: num_passing,
    total: num_total,
  };
}

async function fetchTestResultsOfRun(run_id) {
  let folders = {};    
  for (let test_folder of wpt_test_folders) {
      folders[test_folder] = await fetchTestResultsOfFolder(run_id, test_folder);
  }
  return folders;
}

async function fetchLatestRunDataAndResults() {
  let raw_data = await fetchWptRawData('runs?label=master&product=chrome&max-count=1');
  let latest_entry = {
    timestamp: Date.parse(raw_data[0].time_end),
    id: raw_data[0].id,
  };
  if (test_data.length == 0 || test_data[test_data.length-1].timestamp != latest_entry.timestamp) {
    latest_entry.folders = await fetchTestResultsOfRun(latest_entry.id);
    test_data.push(latest_entry);
  }
}

function getStyleClassFromPassRatio(passRatio) {
  const min_ratio_for_good_test = 0.9999;
  const min_ratio_for_okay_test = 0.75;

  return passRatio > min_ratio_for_good_test ? "good" :
      passRatio > min_ratio_for_okay_test ? "okay" :
      "bad";
}

function updateLatestResultsView() {
  let last_run_data = test_data[test_data.length-1];
  document.getElementById("timestamp").textContent = new Date(last_run_data.timestamp).toTimeString();

  document.getElementById("wpt-folder").innerHTML = "";
  for (let test_folder of wpt_test_folders) {
    let result = last_run_data.folders[test_folder];

    let testentry_elem = document.createElement("div");
    testentry_elem.classList.add("testentry");

    {
      let testname_elem = testentry_elem.appendChild(document.createElement("span"));
      testname_elem.classList.add("name");
      testname_elem.textContent = test_folder;
    }

    for (let i = Math.max(0, test_data.length-5); i < test_data.length-1; i++) {
      let result_elem = testentry_elem.appendChild(document.createElement("span"));
      let past_result = test_data[i].folders[test_folder];
      result_elem.classList.add("result");
      result_elem.classList.add("old");
      result_elem.classList.add(getStyleClassFromPassRatio(past_result.passing/past_result.total));
      result_elem.textContent = past_result.passing;
    }

    {
      let result_elem = testentry_elem.appendChild(document.createElement("span"));
      result_elem.classList.add("result");
      result_elem.classList.add("latest");
      result_elem.classList.add(getStyleClassFromPassRatio(result.passing/result.total));
      result_elem.textContent = result.passing + '/' + result.total;
    }

    document.getElementById("wpt-folder").appendChild(testentry_elem);
  }
}

function updateHistoricalResultsView() {
  var data_pass = [
    ['Timestamp', 'Pass'],
  ];
  var data_fail = [
    ['Timestamp', 'Failures'],
  ];
  for (let i=0; i<test_data.length; i++) {
    let total_passes = 0;
    let total = 0;
    for (let test_folder of wpt_test_folders) {
      total_passes += test_data[i].folders[test_folder].passing;
      total += test_data[i].folders[test_folder].total; 
    }
    data_fail.push([new Date(test_data[i].timestamp), total-total_passes]);
    data_pass.push([new Date(test_data[i].timestamp), total_passes]);
  }
  var chart_fail = new google.visualization.LineChart(document.getElementById('wpt-fail-history'));
  chart_fail.draw(google.visualization.arrayToDataTable(data_fail), {
    title: 'Input dev total failed tests',
    pointSize: 5,
    vAxis: {format: '0'},
    series: {
      0: {color: "red"},
    },
    legend: { position: 'right' }
  });

  var chart_pass = new google.visualization.LineChart(document.getElementById('wpt-pass-history'));
  chart_pass.draw(google.visualization.arrayToDataTable(data_pass), {
    title: 'Input dev total passed tests',
    pointSize: 5,
    vAxis: {format: '0'},
    series: {
      0: {color: "green"},
    },
    legend: { position: 'right' }
  });
}

function updateViews() {
  updateLatestResultsView();
  updateHistoricalResultsView();
}

async function appTick() {
  document.getElementById("last_updated").innerHTML = "Fetching the latest data...";
  await fetchLatestRunDataAndResults();
  document.getElementById("last_updated").innerHTML = new Date().toTimeString();
 
  updateViews();

  // Do some historical data fetch for the first time the app loads and this function is called.
  // In this case test_data already has one entry as for the latest run that is already fetched.
  if (test_data.length == 1) {
    await fetchRecentRunDataAndResults();
  }

  window.setTimeout(appTick, config.update_period*60*1000);
} 

async function fetchRecentRunDataAndResults() {
  let raw_data = await fetchWptRawData('runs?label=master&product=chrome&max-count='+config.history_count);
  for (let i=raw_data.length-1; i>=0; i--) {
    let entry = {
      timestamp: Date.parse(raw_data[i].time_end),
      id: raw_data[i].id,
    };  
    if (test_data[test_data.length-1].timestamp > entry.timestamp) {
      entry.folders = await fetchTestResultsOfRun(entry.id);
      test_data.splice(test_data.length-1, 0, entry);
      updateViews();
    }
  }
}

function init() {
  google.charts.load('current', {'packages':['corechart']});

  appTick();
  
}
