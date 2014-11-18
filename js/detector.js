/**
 * Created by Sawan on 3/11/2014.
 */

threshold = 128;
DEBUG = false;

// A continuacion se va a programar el acceso a la webcam del usuario
var video = document.createElement('video');
video.width = 640;
video.height = 480;
video.loop = true;
video.volume = 0;
video.autoplay = true;
video.style.display = 'none';
video.controls = true;

var recognition, recognizing, recon_allow;

var getUserMedia = function(t, onsuccess, onerror) {
    if (navigator.getUserMedia) {
        return navigator.getUserMedia(t, onsuccess, onerror);
    } else if (navigator.webkitGetUserMedia) {
        return navigator.webkitGetUserMedia(t, onsuccess, onerror);
    } else if (navigator.mozGetUserMedia) {
        return navigator.mozGetUserMedia(t, onsuccess, onerror);
    } else if (navigator.msGetUserMedia) {
        return navigator.msGetUserMedia(t, onsuccess, onerror);
    } else {
        onerror(new Error("No getUserMedia implementation found."));
    }
};

var URL = window.URL || window.webkitURL;
var createObjectURL = URL.createObjectURL || webkitURL.createObjectURL;
if (!createObjectURL) {
    throw new Error("URL.createObjectURL not found.");
}

getUserMedia({'video': true},
    function(stream) {
        var url = createObjectURL(stream);
        video.src = url;
    },
    function(error) {
        alert("Couldn't access webcam.");
    }
);

window.onload = function() {
    document.getElementById('loading').style.display = 'none';
    document.body.appendChild(video);

    var canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.style.display = 'block';

    var videoCanvas = document.createElement('canvas');
    videoCanvas.width = video.width;
    videoCanvas.height = video.height;

    var ctx = canvas.getContext('2d');
    ctx.font = "24px URW Gothic L, Arial, Sans-serif";


    // Crear un objeto rastrer RGB para el canvas 2D
    // JSARToolKit usa objetos tipo rastrer para leer imagenes.
    // Nota: Se ha de cambiar el estado a true del canvas por cada frame.
    var raster = new NyARRgbRaster_Canvas2D(canvas);

    // FLARParam es el objeto usado por FLARToolKit para fijar los parametros de la camara.
    // Creamos una un FLARParam para imagenes de la dimension 320x240 pixeles.
    var param = new FLARParam(320,240);

    // Se crea un objeto NyARTransMatResult object para obtener la matriz de translacion del marcador.
    var resultMat = new NyARTransMatResult();

    // El FLARMultiIDMarkerDetector es el motor para la deteccion de marcadores.
    // Detecta diferentes tipos de marcadores. Marcadores ID son marcadores especiales que tienen codificado
    // un numero.
    var detector = new FLARMultiIdMarkerDetector(param, 120);

    // Para realizar un seguimiento del video se ha de fijar el continue mode a true.
    // Este modo intenta detectar marcadores en los distintos frames.
    detector.setContinueMode(true);

    // glMatrix matrices son del tipo float.
    var tmp = new Float32Array(16);


    var renderer = new THREE.WebGLRenderer();
    renderer.setSize(960, 720);

    var glCanvas = renderer.domElement;
    var s = glCanvas.style;
    document.body.appendChild(glCanvas);

    var scene = new THREE.Scene();
    var light = new THREE.PointLight(0xffffff);
    light.position.set(400, 500, 100);
    scene.add(light);
    var light = new THREE.PointLight(0xffffff);
    light.position.set(-400, -500, -100);
    scene.add(light);

    // Se crea la camara para la escena de Three.js.
    var camera = new THREE.Camera();
    scene.add(camera);

    // Se configura la camara de Three.js para que use la matriz FLARParam.
    param.copyCameraMatrix(tmp, 10, 10000);
    camera.projectionMatrix.setFromArray(tmp);

    var videoTex = new THREE.Texture(videoCanvas);

    // Creamos la geometria basica.
    var plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2, 0),
        new THREE.MeshBasicMaterial({map: videoTex})
    );
    plane.material.depthTest = false;
    plane.material.depthWrite = false;
    var videoCam = new THREE.Camera();
    var videoScene = new THREE.Scene();
    videoScene.add(plane);
    videoScene.add(videoCam);

    // reconocimiento por voz
    if (!('webkitSpeechRecognition') in window){
        recon_allow = false;
        window.alert("No se puede realizar el reconocimiento por voz");
    } else {
        recon_allow = true;
    }

    var times = [];
    var markers = {};
    var lastTime = 0;
    var monster;
    var loader;

    var movement = 0;
    var left = false, right = false;

    if (recon_allow){
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.lang = "es-ES";

        recognition.onstart = function(event) {
            recognizing = true;
        }

        recognition.onend = function(event) {
            recognizing = false;
        }

        recognition.onresult = function(event) {
            for (var i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    captando = event.results[i][0].transcript.toLowerCase().replace(/\s/g, '');
                    if (captando == "right".toLowerCase()){
                        mov = 90;
                        right = true;
                        if (left) {
                            mov += 90;
                            reload();
                            left = false;
                            mov -= 90;
                        }
                        else {
                            reload();
                            left = false;
                        }
                    }
                    else if (captando == "left".toLowerCase()){
                        mov = -90;
                        left = true;
                        if (right) {
                            mov -= 90;
                            reload();
                            right = false;
                            mov += 90;
                        }
                        else {
                            reload();
                            right = false;
                        }

                    }
                }
            }
        }

        if (!recognizing)
            recognition.start();
    }

    setInterval(function(){
        if (video.ended) video.play();
        if (video.paused) return;
        if (window.paused) return;
        if (video.currentTime == video.duration) {
            video.currentTime = 0;
        }
        if (video.currentTime == lastTime) return;
        lastTime = video.currentTime;
        videoCanvas.getContext('2d').drawImage(video,0,0);
        ctx.drawImage(videoCanvas, 0,0,320,240);
        var dt = new Date().getTime();

        canvas.changed = true;
        videoTex.needsUpdate = true;

        var t = new Date();
        var detected = detector.detectMarkerLite(raster, threshold);

        // Iterar sobre los marcadores detectados y obtener sus IDs y matrices.
        for (var idx = 0; idx<detected; idx++) {

            // Se obtiene los datos del marcador actual
            var id = detector.getIdMarkerData(idx);

            // Leer los bytes del paquete de id.
            var currId;

            // Se le pondra un rango de 32-bit.
            if (id.packetLength > 4) {
                currId = -1;
            }else{
                currId=0;
                for (var i = 0; i < id.packetLength; i++ ) {
                    currId = (currId << 8) | id.getPacketData(i);
                }
            }
            if (!markers[currId]) {
                markers[currId] = {};
            }

            // Obtener la matriz de transformacion del marcador detectado.
            detector.getTransformMatrix(idx, resultMat);
            markers[currId].age = 0;

            // Copiamos el resultado en nuestro tracker de marcadores.
            markers[currId].transform = Object.asCopy(resultMat);
        }
        for (var i in markers) {
            var r = markers[i];
            if (r.age > 1) {
                delete markers[i];
                scene.remove(r.model);
            }
            r.age++;
        }
        for (var i in markers) {
            var m = markers[i];
            if (!m.model) {


                m.model = new THREE.Object3D();
                loader = new THREE.ColladaLoader();
                loader.options.convertUpAxis = true;
                loader.load( './model/monster.dae', function(collada) {
                    monster = collada.scene;

                    monster.scale.x = monster.scale.y = monster.scale.z = 0.1;


                    monster.updateMatrix();
                });

                m.model.matrixAutoUpdate = false;
                m.model.add(monster);
                scene.add(m.model);

            }
            copyMatrix(m.transform, tmp);
            m.model.matrix.setFromArray(tmp);
            m.model.matrixWorldNeedsUpdate = true;
        }
        renderer.autoClear = false;
        renderer.clear();
        renderer.render(videoScene, videoCam);
        renderer.render(scene, camera);
    }, 15);
}

function reload() {
    if (m.model) {
        scene.remove(m.model);
        renderer.render(scene,camera);
        m.model = new THREE.Object3D();
        m.model.matrixAutoUpdate = false;
        monster.translateX(mov);
        monster.updateMatrix();
        m.model.add(monster);
        scene.add(m.model);
        copyMatrix(m.transform, tmp);
        m.model.matrix.setFromArray(tmp);
        m.model.matrixWorldNeedsUpdate = true;
        renderer.clear();
        renderer.render(scene, camera);
    }
}


// Primer paso convertir la matriz a una del tipo Three js
THREE.Matrix4.prototype.setFromArray = function(m) {
    return this.set(
        m[0], m[4], m[8], m[12],
        m[1], m[5], m[9], m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15]
    );
};

// Mapeado de Matrices
// Las matrices en JSARToolKit son matrices de 16 elementos del tipo float
// Hace falta crear una funcion que copie las matrices de una libreria a otra
// Funcion de copiado
function copyMatrix(mat, cm) {
    cm[0] = mat.m00;
    cm[1] = -mat.m10;
    cm[2] = mat.m20;
    cm[3] = 0;
    cm[4] = mat.m01;
    cm[5] = -mat.m11;
    cm[6] = mat.m21;
    cm[7] = 0;
    cm[8] = -mat.m02;
    cm[9] = mat.m12;
    cm[10] = -mat.m22;
    cm[11] = 0;
    cm[12] = mat.m03;
    cm[13] = -mat.m13;
    cm[14] = mat.m23;
    cm[15] = 1;
}