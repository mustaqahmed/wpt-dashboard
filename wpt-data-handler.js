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

async function fetchLatestRunData() {
  let raw_data = await fetchWptRawData('runs?label=master&product=chrome&max-count=1');
  return {
    timestamp: Date.parse(raw_data[0].time_end),
    id: raw_data[0].id,
  };
}

async function fetchTestResults(run_id, wpt_folder) {
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

function getStyleClassFromPassRatio(passRatio) {
  const min_ratio_for_good_test = 0.99;
  const min_ratio_for_okay_test = 0.75;

  return passRatio > min_ratio_for_good_test ? "good" :
      passRatio > min_ratio_for_okay_test ? "okay" :
      "bad";
}

async function init() {
  let run_data = await fetchLatestRunData();

  document.getElementById("timestamp").textContent = new Date(run_data.timestamp).toTimeString();

  for (let test_folder of wpt_test_folders) {
    let result = await fetchTestResults(run_data.id, test_folder);

    let testentry_elem = document.createElement("div");
    testentry_elem.classList.add("testentry");

    {
      let testname_elem = testentry_elem.appendChild(document.createElement("span"));
      testname_elem.classList.add("name");
      testname_elem.textContent = test_folder;
    }

    // TODO: Pull past data.
    for (let i = 0; i < 4; i++) {
      let result_elem = testentry_elem.appendChild(document.createElement("span"));
      result_elem.classList.add("result");
      result_elem.classList.add("old");
      result_elem.classList.add(getStyleClassFromPassRatio(result.passing/result.total));
      result_elem.textContent = result.passing;
    }

    {
      let result_elem = testentry_elem.appendChild(document.createElement("span"));
      result_elem.classList.add("result");
      result_elem.classList.add("latest");
      result_elem.classList.add(getStyleClassFromPassRatio(result.passing/result.total));
      result_elem.textContent = result.passing + '/' + result.total;
    }

    document.getElementById("dashboard-wpt").appendChild(testentry_elem);
  }
}
