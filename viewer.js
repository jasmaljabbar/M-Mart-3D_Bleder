import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = selector => document.querySelector(selector);
const viewport = $('#viewport');
const notice = $('#notice');
const status = $('#status');
const fitButton = $('#fit');
const fileInput = $('#files');
const defaultURL = './models/supermarket.glb';
const initialDirection = new THREE.Vector3(0.4, 1.25, 1.6).normalize();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eaf0f4');
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  $('#notice-title').textContent = '3D graphics unavailable';
  $('#notice-detail').textContent = 'Enable WebGL and hardware acceleration, then reload this page.';
  $('#progress').hidden = true;
  status.textContent = 'WebGL unavailable';
  $('#open').disabled = true;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
viewport.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '3D model. Drag to rotate, scroll to zoom, right-drag or arrow keys to pan. Press F to fit.');
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.dampingFactor = 0.085;
controls.screenSpacePanning = true;
controls.listenToKeyEvents(renderer.domElement);
controls.minDistance = 0.15;
controls.maxDistance = 200;

// Ambient fill and a directional key keep the model visible from every angle.
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
scene.add(new THREE.HemisphereLight(0xe5efff, 0x969183, 0.55));
const keyLight = new THREE.DirectionalLight(0xfff2dc, 2.0);
keyLight.position.set(-6, 12, 9);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xcadfff, 0.5);
fillLight.position.set(8, 5, -6);
scene.add(fillLight);
// Local, procedural environment; no remote textures or HDR downloads.
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentTarget = pmrem.fromScene(environment, 0.04);
scene.environment = environmentTarget.texture;
scene.environmentIntensity = 0.45;
environment.dispose();
pmrem.dispose();

let model = null;
let modelBounds = new THREE.Box3();
let fitDistance = 12;
let loadSequence = 0;
let pendingFrame = false;
let contextLost = false;
let dragDepth = 0;
let loadedName = '';
let lastError = '';
const displaySize = new THREE.Vector3();

function render() {
  pendingFrame = false;
  if (contextLost) return;
  controls.update();
  renderer.render(scene, camera);
}
function invalidate() {
  if (!pendingFrame && !contextLost) {
    pendingFrame = true;
    requestAnimationFrame(render);
  }
}
controls.addEventListener('change', invalidate);
renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus({ preventScroll: true }));

function corners(box) {
  const points = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
  return points;
}
function distanceToFit(direction, target) {
  const right = new THREE.Vector3().crossVectors(camera.up, direction);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  let distance = 0;
  for (const point of corners(modelBounds)) {
    const relative = point.sub(target);
    const towardCamera = relative.dot(direction);
    distance = Math.max(distance,
      Math.abs(relative.dot(right)) * 1.13 / tanX + towardCamera,
      Math.abs(relative.dot(up)) * 1.13 / tanY + towardCamera);
  }
  return Math.max(distance, 0.1);
}
function fitModel() {
  if (!model) return;
  controls.reset();
  modelBounds.getCenter(controls.target);
  fitDistance = distanceToFit(initialDirection, controls.target);
  camera.position.copy(controls.target).addScaledVector(initialDirection, fitDistance);
  camera.near = 0.05;
  camera.far = Math.max(500, fitDistance * 30);
  camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(200, fitDistance * 8);
  controls.update();
  controls.saveState();
  invalidate();
}
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 1 || height < 1) return;
  const direction = camera.position.clone().sub(controls.target).normalize();
  const zoomRatio = camera.position.distanceTo(controls.target) / fitDistance;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  if (model) {
    fitDistance = distanceToFit(direction, controls.target);
    camera.position.copy(controls.target).addScaledVector(direction, fitDistance * zoomRatio);
    controls.update();
  }
  invalidate();
}
new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);
fitButton.addEventListener('click', fitModel);
renderer.domElement.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); fitModel(); }
  if (event.key === '+' || event.key === '=' || event.key === '-') {
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * (event.key === '-' ? 1.15 : 1 / 1.15), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update(); invalidate();
  }
});

function setLoading(name) {
  notice.hidden = false;
  $('#notice-title').textContent = 'Loading model';
  $('#notice-detail').textContent = name;
  $('#progress').hidden = false;
  $('#progress').removeAttribute('value');
  $('#dismiss').hidden = true;
  status.textContent = 'Loading model';
  viewport.setAttribute('aria-busy', 'true');
  lastError = '';
}
function showError(error) {
  lastError = error.message || String(error);
  notice.hidden = false;
  $('#notice-title').textContent = 'Model could not load';
  $('#notice-detail').textContent = /draco/i.test(lastError)
    ? 'This model uses Draco compression. Export an uncompressed GLB, or configure a Draco decoder in viewer.js.'
    : `Check the model and its associated files. ${lastError.slice(0, 190)}`;
  $('#progress').hidden = true;
  $('#dismiss').hidden = false;
  status.textContent = model ? 'Previous model retained' : 'Choose a GLB or glTF file';
  viewport.setAttribute('aria-busy', 'false');
  console.warn('Model load failed:', lastError);
}
$('#dismiss').addEventListener('click', () => { notice.hidden = true; });
function disposeModel(root) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && value !== scene.environment) textures.add(value);
    }
    if (object.isInstancedMesh) object.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
}
function acceptModel(gltf, name) {
  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error('No scene found in this file.');
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  bounds.getSize(displaySize);
  const largest = Math.max(displaySize.x, displaySize.y, displaySize.z);
  if (bounds.isEmpty() || !Number.isFinite(largest) || largest <= 0) {
    disposeModel(root); throw new Error('The file contains no visible model geometry.');
  }
  // Normalize display scale and center even off-origin models; original dimensions remain in the caption.
  const center = bounds.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const wrapper = new THREE.Group();
  wrapper.name = name;
  wrapper.add(root);
  wrapper.scale.setScalar(10 / largest);
  wrapper.position.y = displaySize.y * 0.5 * (10 / largest);
  wrapper.updateMatrixWorld(true);
  const previous = model;
  scene.remove(previous);
  model = wrapper;
  scene.add(model);
  disposeModel(previous);
  modelBounds.setFromObject(model);
  loadedName = name;
  $('#model-name').textContent = name;
  const dimensions = [displaySize.x, displaySize.z, displaySize.y].map(v => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format(v));
  $('#model-size').textContent = `${dimensions.join(' × ')} m · width × depth × height${name === 'Supermarket cutaway' ? ' · estimated' : ''}`;
  fitButton.disabled = false;
  viewport.setAttribute('aria-busy', 'false');
  notice.hidden = true;
  status.textContent = 'Ready to explore';
  fitModel();
}
async function loadModel(source, name, files = []) {
  const sequence = ++loadSequence;
  setLoading(name);
  const urls = new Map();
  const normalized = path => decodeURIComponent(path).replace(/\\/g, '/').replace(/^\.\//, '').split(/[?#]/)[0];
  const manager = new THREE.LoadingManager();
  if (files.length) manager.setURLModifier(url => {
    if (/^(data:|blob:)/.test(url)) return url;
    const key = normalized(url);
    const matching = files.filter(file => normalized(file.webkitRelativePath || file.name) === key || file.name === key.split('/').pop());
    if (matching.length !== 1) {
      if (/^https?:/i.test(url) && matching.length === 0) return url;
      throw new Error(matching.length ? `Ambiguous asset: ${key}` : `Missing asset: ${key}. Select it together with the glTF file.`);
    }
    const file = matching[0];
    if (!urls.has(file)) urls.set(file, URL.createObjectURL(file));
    return urls.get(file);
  });
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = typeof source === 'string'
      ? await loader.loadAsync(source, event => {
          if (sequence !== loadSequence) return;
          if (event.lengthComputable) { $('#progress').max = event.total; $('#progress').value = event.loaded; }
        })
      : await loader.parseAsync(await source.arrayBuffer(), '');
    if (sequence !== loadSequence) { disposeModel(gltf.scene); return; }
    acceptModel(gltf, name);
  } catch (error) {
    if (sequence === loadSequence) showError(error);
  } finally {
    urls.forEach(url => URL.revokeObjectURL(url));
  }
}
function loadFiles(fileList) {
  const files = [...fileList];
  const models = files.filter(file => /\.(glb|gltf)$/i.test(file.name));
  if (models.length !== 1) { ++loadSequence; showError(new Error('Choose one .glb or .gltf model, along with any .bin or texture files.')); return; }
  loadModel(models[0], models[0].name, files);
}
$('#open').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files.length) loadFiles(fileInput.files); });
const stage = $('#stage');
stage.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; stage.classList.add('dragging'); });
stage.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
stage.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; stage.classList.remove('dragging'); } });
stage.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; stage.classList.remove('dragging'); loadFiles(event.dataTransfer.files); });
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault(); contextLost = true; showError(new Error('Graphics context lost. Reload the page to restore the viewer.'));
});
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; invalidate(); });
window.addEventListener('pagehide', () => { controls.dispose(); disposeModel(model); environmentTarget.dispose(); renderer.dispose(); });

// Read-only integration/QA snapshot. Model and renderer remain private.
export function getViewerState() {
  camera.updateMatrixWorld(true);
  return {
    loaded: !!model, name: loadedName, error: lastError,
    camera: camera.position.toArray(), target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target), aspect: camera.aspect,
    projectedBounds: model ? corners(modelBounds).map(point => point.project(camera).toArray()) : [],
    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    width: renderer.domElement.clientWidth, height: renderer.domElement.clientHeight,
  };
}
resize();
$('#open').disabled = false;
const requestedModel = new URLSearchParams(location.search).get('model');
const modelURL = requestedModel ? new URL(requestedModel, location.href).href : defaultURL;
loadModel(modelURL, requestedModel ? decodeURIComponent(modelURL.split('/').pop().split('?')[0]) : 'Supermarket cutaway');
