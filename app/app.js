const app = App();
let lastResourceVersion;

fetch("/api/v1/nodes")
  .then(response => response.json())
  .then(response => {
    const nodes = response.items;
    nodes.forEach(node => {
      const name = `${node.metadata.name}`;
      if (node.metadata.labels["node-role.kubernetes.io/master"] != null) {
        app.upsertNode(name, "control-plane");
      } else {
        app.upsertNode(name, "workload");
      }
    });
  });
//  .then(() => streamNodeUpdates())

fetch("/api/v1/namespaces")
  .then(response => response.json())
  .then(response => {
    const namespaces = response.items;
    namespaces.forEach(namespace => {
      const name = `${namespace.metadata.name}`;
      // We can check for (portal.name, environment.name, session.name, workshop.name)
      if (
        namespace.metadata.labels != null &&
        namespace.metadata.labels["training.educates.dev/workshop.name"] != null
      ) {
        app.upsertNamespace(
          name,
          "educates",
          namespace.metadata.labels["training.educates.dev/environment.name"],
          namespace.metadata.labels["training.educates.dev/portal.name"],
          namespace.metadata.labels["training.educates.dev/session.name"],
          namespace.metadata.labels["training.educates.dev/workshop.name"]
        );
      } else {
        app.upsertNamespace(name, "workload");
      }
    });
  });
//  .then(() => streamNamespaceUpdates())

fetch("/api/v1/pods")
  .then(response => response.json())
  .then(response => {
    const pods = response.items;
    lastResourceVersion = response.metadata.resourceVersion;
    pods.forEach(pod => {
      const podId = `${pod.metadata.namespace}-${pod.metadata.name}`;
      app.upsert(podId, pod);
    });
  })
  .then(() => streamPodUpdates());

function streamPodUpdates() {
  fetch(`/api/v1/pods?watch=1&resourceVersion=${lastResourceVersion}`)
    .then(response => {
      const stream = response.body.getReader();
      const utf8Decoder = new TextDecoder("utf-8");
      let buffer = "";

      return stream.read().then(function processText({ done, value }) {
        if (done) {
          console.log("Request terminated");
          return;
        }
        buffer += utf8Decoder.decode(value);
        buffer = onNewLine(buffer, chunk => {
          if (chunk.trim().length === 0) {
            return;
          }
          try {
            const event = JSON.parse(chunk);
            console.log("PROCESSING EVENT: ", event);
            const pod = event.object;
            const podId = `${pod.metadata.namespace}-${pod.metadata.name}`;
            switch (event.type) {
              case "ADDED": {
                app.upsert(podId, pod);
                break;
              }
              case "DELETED": {
                app.remove(podId);
                break;
              }
              case "MODIFIED": {
                app.upsert(podId, pod);
                break;
              }
              default:
                break;
            }
            lastResourceVersion = event.object.metadata.resourceVersion;
          } catch (error) {
            console.log("Error while parsing", chunk, "\n", error);
          }
        });
        return stream.read().then(processText);
      });
    })
    .catch(() => {
      console.log("Error! Retrying in 5 seconds...");
      setTimeout(() => streamUpdates(), 5000);
    });

  function onNewLine(buffer, fn) {
    const newLineIndex = buffer.indexOf("\n");
    if (newLineIndex === -1) {
      return buffer;
    }
    const chunk = buffer.slice(0, buffer.indexOf("\n"));
    const newBuffer = buffer.slice(buffer.indexOf("\n") + 1);
    fn(chunk);
    return onNewLine(newBuffer, fn);
  }
}

function App() {
  const allNodes = new Map();
  const allPods = new Map();
  const allNamespaces = new Map();
  const educatesNamespaces = new Map();
  const content = document.querySelector("#content");

  function render() {
    // Get selector for grouping
    let grouping = $("#pods-grouped-by").val();

    const pods = Array.from(allPods.values());
    if (pods.length === 0) {
      return;
    }
    // TODO: Group by condition
    let groupingTemplate;
    if (grouping == "workshop") {
      const groupedPods = groupBy(pods, it => it.workshop);
      groupingTemplate = Object.keys(groupedPods).map(workshop => {
        const pods = groupedPods[workshop];
        return htmlForGroup(workshop, pods, grouping).join("");
      });
    } else if (grouping == "namespace") {
      const groupedPods = groupBy(pods, it => it.namespace);
      groupingTemplate = Object.keys(groupedPods).map(namespace => {
        const pods = groupedPods[namespace];
        return htmlForGroup(namespace, pods, grouping).join("");
      });
    } /* if (grouping == "node") */ else {
      // DEFAULT
      const groupedPods = groupBy(pods, it => it.nodeName);
      groupingTemplate = Object.keys(groupedPods).map(nodeName => {
        const pods = groupedPods[nodeName];
        return htmlForNode(nodeName, pods).join("");
      });
    }
    content.innerHTML = `${groupingTemplate.join("")}`;

    function htmlForGroup(groupName, pods, grouping) {
      var _icon = grouping == "workshop" ? "icons/educates-workshop.png" : "icons/ns.png";
      // return [
      //   '<li class="group-box">',
      //   '<div class="group-box-div">',
      //   '<div class="group-text-div">',
      //   `<div class="group-text-div-image"><img src="${_icon}" class="group-icon"></img></div>`,
      //   `<div class="group-text-div-text"><p class="group-text">${groupName}</p></div>`,
      //   "</div>",
      //   `<div class="group-container">${renderPod(pods)}</div>`,
      //   "</div>",
      //   "</li>",
      // ];
      return [
        '<li class="group-box">',
        '<div class="box_div">',
        '<div class="box_subdiv">',
        `<img src="${_icon}" class="group-icon"></img>`,
        `<p class="group-text">${groupName}</p>`,
        "</div>",
        `<div class="box_containerdiv">${renderPod(pods)}</div>`,
        "</div>",
        "</li>",
      ];
    }
    // ${allNodes.get(nodeName).type} node
    // function htmlForNode(nodeName, pods) {
    //   return [
    //     '<li class="group-box">',
    //     '<div class="group-box-div">',
    //     '<div class="group-text-div">',
    //     '<div class="group-text-div-image"><img src="icons/node.png" class="group-icon"></img></div>',
    //     `<div class="group-text-div-text"><p class="group-text">${
    //       allNodes.get(nodeName).type
    //     }</p></div>`,
    //     "</div>",
    //     `<div class="group-container">${renderPod(pods)}</div>`,
    //     "</div>",
    //     "</li>",
    //   ];
    // }
    function htmlForNode(nodeName, pods) {
      return [
        '<li class="group-box">',
        '<div class="box_div">',
        '<div class="box_subdiv">',
        '<img src="icons/node.png" class="group-icon"></img>',
        `<p class="group-text">${allNodes.get(nodeName).type}</p>`,
        "</div>",
        `<div class="box_containerdiv">${renderPod(pods)}</div>`,
        "</div>",
        "</li>",
      ];
    }

    function renderPod(pods) {
      return [pods.map(pod => htmlForPod(pod)).join("")].join("");
    }
    function htmlForPod(pod) {
      if ($("#onlyeducates").hasClass("selected")) {
        // Filter out only "regular" workload not in an "educates" namespace (which is identified as "user")
        if (pod.type == "regular") {
          return "";
        }
      }
      return `<img src="${pod.icon}" class="pod is-solid" onmouseenter="showPodDetails('${pod.name}','${pod.type}','${pod.namespace}')" onmouseleave="hidePodDetails()"></img>`;
      //      return `<clr-icon shape="${pod.icon}" class="pod is-solid" onmouseenter="showPodDetails('${pod.name}','${pod.type}','${pod.namespace}')" onmouseleave="hidePodDetails()"></clr-icon>`;
    }
  }

  return {
    reload() {
      render();
    },
    upsertNode(name, type) {
      allNodes.set(name, {
        name: name,
        type: type,
      });
    },
    upsertNamespace(name, type, environment, portal, session, workshop) {
      var _portal = portal == null ? " " : portal;
      var _session = session == null ? " " : session;
      var _workshop = workshop == null ? " " : workshop;
      var _environment = environment == null ? " " : environment;
      if (type == "educates") {
        educatesNamespaces.set(name, {
          name: name,
          type: type,
          portal: _portal,
          session: _session,
          workshop: _workshop,
          environment: _environment,
        });
      }
    },
    upsert(podId, pod) {
      let _icon = "icons/pod.png"; //"pod";
      let _trainingportal = " ";
      let _session = " ";
      let _workshop = " ";
      let _type = "regular";
      if (pod.metadata.labels["training.educates.dev/portal.name"] != null) {
        // If it is an educates related pod
        // Get the trainingportal
        _trainingportal = pod.metadata.labels["training.educates.dev/portal.name"];
        // Get the workshop
        _session = pod.metadata.labels["training.educates.dev/session.name"];
        // Get the workshop
        _workshop = pod.metadata.labels["training.educates.dev/workshop.name"];
        // Get the icon based on the type of workload
        if (pod.metadata.labels["training.educates.dev/session.services.registry"] == "true") {
          _icon = "icons/educates-registry.png"; //"data-cluster";
          _type = "registry";
        }
        if (pod.metadata.labels["training.educates.dev/session.services.workshop"] == "true") {
          _icon = "icons/educates-workshop.png"; //"terminal";
          _type = "workshop";
        }
        if (pod.metadata.labels["training.educates.dev/portal.services.dashboard"] == "true") {
          _icon = "icons/educates-trainingportal.png"; //"tools";
          _type = "trainingportal";
          // We add portal name as workshop so that it can be displayed
          _workshop = pod.metadata.labels["training.educates.dev/portal.name"];
        }
      } else if (educatesNamespaces.has(pod.metadata.namespace)) {
        // Check regular workload that is deployed in educates namespaces
        _icon = "icons/educates.png"; // Workload
        _type = "user";
        let _namespace = educatesNamespaces.get(pod.metadata.namespace);
        _trainingportal = _namespace.portal;
        _session = _namespace.session;
        _workshop = _namespace.workshop;
        // _environment = _namespace.environment;
      }
      if (!pod.spec.nodeName) {
        return;
      }
      allPods.set(podId, {
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        nodeName: pod.spec.nodeName,
        type: _type,
        trainingportal: _trainingportal,
        session: _session,
        workshop: _workshop,
        icon: _icon,
      });
      render();
    },
    remove(podId) {
      allPods.delete(podId);
      render();
    },
  };
}

function groupBy(arr, groupByKeyFn) {
  return arr.reduce((acc, c) => {
    const key = groupByKeyFn(c);
    if (!(key in acc)) {
      acc[key] = [];
    }
    acc[key].push(c);
    return acc;
  }, {});
}
