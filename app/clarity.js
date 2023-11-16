function showPodDetails(name, type, namespace) {
  $("#selectedpod-podname").val(name);
  $("#selectedpod-podtype").val(type);
  $("#selectedpod-namespace").val(namespace);
}

function hidePodDetails() {
  $("#selectedpod-podname").val("");
  $("#selectedpod-podtype").val("");
  $("#selectedpod-namespace").val("");
}

function clickOnlyeducates() {
  let onlyeducates = $("#onlyeducates");
  if (onlyeducates.hasClass("selected")) {
    onlyeducates.removeClass("selected");
    app.reload();
  } else {
    onlyeducates.addClass("selected");
    app.reload();
  }
}
