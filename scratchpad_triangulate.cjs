const THREE = require('three');
const contour = [
  new THREE.Vector2(0,0),
  new THREE.Vector2(10,0),
  new THREE.Vector2(10,10),
  new THREE.Vector2(5,5),
  new THREE.Vector2(0,10)
];
const indices = THREE.ShapeUtils.triangulateShape(contour, []);
console.log(indices);
