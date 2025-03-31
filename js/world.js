// Three.js scene setup
let scene, camera, renderer, controls;
let worldObjects = [];
let target = null;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = true;
let jumpVelocity = 0;
let score = 0;
let isShooting = false;
let gameTime = 0;
let gameMode = 'free';
let gameActive = false;
let movementMode = 'moving'; // 'moving' or 'static'
let gameType = 'single'; // 'single' or 'pvp'

// Player health system
const MAX_HEALTH = 100;
let player1Health = MAX_HEALTH;
let player2Health = MAX_HEALTH;
let player1 = null;
let player2 = null;
let isPlayer1 = true; // Determines which player the user controls
let respawnTime = 3; // Seconds to wait before respawning
let player1Dead = false;
let player2Dead = false;

// Movement constants
const GRAVITY = 0.3;
const JUMP_FORCE = 0.15;
const MOVEMENT_SPEED = 0.1;
const MOUSE_SENSITIVITY = 0.002;

// Target movement variables
let targetAngle = 0;
let targetSpeed = 0.075;
const TARGET_BOUNDARY = 8;
const TARGET_HEIGHT = 9; // Increased from 7 to 9 to raise it higher
let targetStartedMoving = false;
let gameStarted = false;

// Add pointer lock state tracking
let isPointerLocked = false;
let pointerLockMessage = null;

// New variables for random movement
let currentDirection = 0;
let nextDirectionChange = 0;
const MIN_DIRECTION_TIME = 1; // seconds
const MAX_DIRECTION_TIME = 3; // seconds

// Create audio context for sound effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// We'll store our one shot buffer here
let shotBuffer = null;

// Add spray cooldown
let lastSprayTime = 0;
const SPRAY_COOLDOWN = 50; // milliseconds between shots in spray mode

// Add accuracy tracking
let shotsFired = 0;
let shotsHit = 0;
let accuracy = 0;

// Add raycaster as a global variable
let raycaster = new THREE.Raycaster();

// Add character model variables
let character = null;
let characterBody = null;
let characterHead = null;

// Add Socket.IO connection
let socket = null;
let playerNumber = null;
let otherPlayer = null;

function initializeSocket() {
    const serverUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    try {
        socket = io(serverUrl);
        
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            // Fallback to single player mode if connection fails
            gameType = 'single';
        });
        
        // Set up existing socket event handlers
        socket.on('playerNumber', (number) => {
            playerNumber = number;
            console.log(`You are player ${number}`);
        });
        
        socket.on('gameState', (players) => {
            players.forEach(player => {
                if (player.number !== playerNumber) {
                    otherPlayer = createPlayer(player.number);
                    otherPlayer.position.set(player.position.x, player.position.y, player.position.z);
                }
            });
        });

        socket.on('playerMoved', (data) => {
            if (otherPlayer && data.id !== socket.id) {
                otherPlayer.position.set(data.position.x, data.position.y, data.position.z);
            }
        });

        socket.on('playerHealthUpdate', (data) => {
            if (data.id === socket.id) {
                if (playerNumber === 1) {
                    player1Health = data.health;
                } else {
                    player2Health = data.health;
                }
                updateHealthDisplay();
            }
        });

        socket.on('playerDied', (playerId) => {
            if (playerId === socket.id) {
                if (playerNumber === 1) {
                    player1Dead = true;
                    player1.visible = false;
                } else {
                    player2Dead = true;
                    player2.visible = false;
                }
            } else if (otherPlayer) {
                otherPlayer.visible = false;
            }
        });

        socket.on('playerRespawned', (data) => {
            if (data.id === socket.id) {
                if (playerNumber === 1) {
                    player1Dead = false;
                    player1.visible = true;
                    player1.position.set(data.position.x, data.position.y, data.position.z);
                } else {
                    player2Dead = false;
                    player2.visible = true;
                    player2.position.set(data.position.x, data.position.y, data.position.z);
                }
            } else if (otherPlayer) {
                otherPlayer.visible = true;
                otherPlayer.position.set(data.position.x, data.position.y, data.position.z);
            }
        });

        socket.on('playerDisconnected', (playerId) => {
            if (otherPlayer) {
                scene.remove(otherPlayer);
                otherPlayer = null;
            }
        });
    } catch (error) {
        console.error('Failed to initialize socket:', error);
        gameType = 'single';
    }
}

// Update sensitivity controls
let mouseSensitivity = 1.0; // Default sensitivity
const MIN_SENSITIVITY = 0.25; // -4x
const MAX_SENSITIVITY = 4.0;  // +4x

// Start the game when the page loads
window.addEventListener('load', function() {
    // Initialize socket first
    initializeSocket();
    // Create the initial launcher screen
    createLauncherScreen();
});

function createCheckerboardTexture(size = 1, divisions = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  
  const tileSize = canvas.width / divisions;
  
  for (let i = 0; i < divisions; i++) {
    for (let j = 0; j < divisions; j++) {
      context.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#cccccc';
      context.fillRect(i * tileSize, j * tileSize, tileSize, tileSize);
    }
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(size, size);
  
  return texture;
}

function createLauncherScreen() {
    const launcherScreen = document.createElement('div');
    launcherScreen.className = 'launcher-screen';
    launcherScreen.innerHTML = `
        <div class="version">v1.01</div>
        <h1>Aim Trainer</h1>
        <div class="controls">
            <div class="control-group">
                <label>Game Type:</label>
                <select id="gameType">
                    <option value="single">Single Player</option>
                    <option value="pvp">PvP</option>
                </select>
            </div>
            <div class="control-group">
                <label>Time Mode:</label>
                <select id="timeMode">
                    <option value="free">Free</option>
                    <option value="30">30s</option>
                    <option value="60">60s</option>
                    <option value="120">120s</option>
                </select>
            </div>
            <div class="control-group">
                <label>Movement Mode:</label>
                <select id="movementMode">
                    <option value="stationary">Stationary</option>
                    <option value="moving">Moving</option>
                </select>
            </div>
            <div class="control-group">
                <label>Mouse Sensitivity:</label>
                <input type="range" id="sensitivity" min="0" max="100" value="50">
                <span id="sensitivityValue">1.0x</span>
            </div>
        </div>
        <button id="playButton">Play</button>
    `;
    document.body.appendChild(launcherScreen);

    // Add sensitivity slider event listener
    const sensitivitySlider = document.getElementById('sensitivity');
    const sensitivityValue = document.getElementById('sensitivityValue');
    
    sensitivitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        // Convert slider value (0-100) to sensitivity range (0.25-4.0)
        mouseSensitivity = MIN_SENSITIVITY + (value / 100) * (MAX_SENSITIVITY - MIN_SENSITIVITY);
        sensitivityValue.textContent = mouseSensitivity.toFixed(2) + 'x';
    });

    // Update play button event listener
    document.getElementById('playButton').addEventListener('click', () => {
        gameType = document.getElementById('gameType').value;
        gameMode = document.getElementById('timeMode').value;
        movementMode = document.getElementById('movementMode').value;
        
        // Remove launcher screen
        launcherScreen.remove();
        
        // Initialize world and start game
        initWorld();
        startGame();
    });
}

function showGameOver() {
  // Only show game over if not in free mode
  if (gameMode === 'free') return;
  
  const gameOver = document.createElement('div');
  gameOver.className = 'launcher-screen';
  gameOver.innerHTML = `
    <div class="launcher-content">
      <h2>Game Over</h2>
      <p>Final Score: ${score}</p>
      <p>Accuracy: ${accuracy.toFixed(1)}%</p>
      <button id="play-again">Play Again</button>
    </div>
  `;
  document.body.appendChild(gameOver);

  // Remove game event listeners
  document.removeEventListener('mousedown', onMouseDown);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);

  document.getElementById('play-again').addEventListener('click', function() {
    gameOver.remove();
    startGame();
  });
}

// Add time tracking for delta time
let lastTime = 0;
let deltaTime = 0;

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    // Calculate delta time
    deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;

    if (controls.isLocked) {
        // Update character position to match camera
        if (character) {
            character.position.x = camera.position.x;
            character.position.z = camera.position.z;
            character.position.y = 0; // Keep character on ground
            
            // Make character face the direction the camera is looking
            character.rotation.y = camera.rotation.y;

            // Send position update to server
            if (gameType === 'pvp') {
                socket.emit('playerMove', {
                    x: character.position.x,
                    y: character.position.y,
                    z: character.position.z
                });
            }
        }

        // Apply movement only if in moving mode
        if (movementMode === 'moving') {
            const moveSpeed = MOVEMENT_SPEED * deltaTime * 60; // Normalize to 60fps
            if (moveForward) controls.moveForward(moveSpeed);
            if (moveBackward) controls.moveForward(-moveSpeed);
            if (moveLeft) controls.moveRight(-moveSpeed);
            if (moveRight) controls.moveRight(moveSpeed);

            // Handle jumping with delta time
            if (!canJump) {
                jumpVelocity -= GRAVITY * deltaTime * 60; // Normalize to 60fps
                camera.position.y += jumpVelocity;

                // Check if landed
                if (camera.position.y <= 2) {
                    camera.position.y = 2;
                    jumpVelocity = 0;
                    canJump = true;
                }
            }
        }

        // Handle shooting in spray mode with cooldown
        if (isShooting) {
            const currentTime = Date.now();
            if (currentTime - lastSprayTime >= SPRAY_COOLDOWN) {
                shotsFired++;
                playShotSound();
                if (target) {
                    checkTargetHit();
                }
                lastSprayTime = currentTime;
            }
        }

        // Update game time if not in free mode and game has started
        if (gameMode !== 'free' && gameTime > 0 && gameStarted) {
            gameTime -= deltaTime; // Use delta time for consistent timing
            document.querySelector('.time-display').textContent = 
                `Time: ${Math.ceil(gameTime)}s`;
            
            if (gameTime <= 0) {
                showGameOver();
            }
        }
    }

    // Move target only if it has started moving
    if (target && targetStartedMoving) {
        const currentTime = Date.now() / 1000; // Convert to seconds

        // Check if it's time to change direction
        if (currentTime >= nextDirectionChange) {
            currentDirection = getRandomDirection();
            nextDirectionChange = currentTime + (Math.random() * (MAX_DIRECTION_TIME - MIN_DIRECTION_TIME) + MIN_DIRECTION_TIME);
        }

        // Calculate new position based on current direction
        // Use X for horizontal movement and Y for vertical movement
        const moveSpeed = targetSpeed * deltaTime * 60; // Normalize to 60fps
        const newX = target.position.x + Math.cos(currentDirection) * moveSpeed;
        const newY = target.position.y + Math.sin(currentDirection) * moveSpeed;

        // Keep target within boundaries
        if (Math.abs(newX) <= TARGET_BOUNDARY && 
            Math.abs(newY - TARGET_HEIGHT) <= TARGET_BOUNDARY) {
            target.position.x = newX;
            target.position.y = newY;
            target.position.z = 0; // Keep target at constant depth
        } else {
            // If target would go out of bounds, change direction
            currentDirection = getRandomDirection();
            nextDirectionChange = currentTime + (Math.random() * (MAX_DIRECTION_TIME - MIN_DIRECTION_TIME) + MIN_DIRECTION_TIME);
        }
    }

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update the startGame function
function startGame() {
    // Clean up any existing game state
    if (gameActive) {
        // Remove existing event listeners
        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        document.removeEventListener('pointerlockerror', onPointerLockError);
        
        // Remove existing UI elements
        const existingUI = document.querySelectorAll('.crosshair, .score-display, .time-display, .health-display');
        existingUI.forEach(element => element.remove());
    }

    // Reset game state
    gameActive = true;
    isPointerLocked = false;
    pointerLockMessage = null;

    // Initialize audio
    initAudio();

    // Reset game variables
    score = 0;
    shotsFired = 0;
    shotsHit = 0;
    accuracy = 0;
    gameTime = gameMode === 'free' ? Infinity : gameMode;
    
    // Remove any existing launcher or game over screens
    const existingScreens = document.querySelectorAll('.launcher-screen');
    existingScreens.forEach(screen => screen.remove());
    
    // Initialize the game world
    initWorld();

    // Request pointer lock after a short delay to ensure everything is set up
    setTimeout(() => {
        if (gameActive) {
            document.body.requestPointerLock();
        }
    }, 100);
}

// This function creates a short beep in an AudioBuffer:
function initAudio() {
  // Build a quick beep (sine wave, 50ms long, frequency=440Hz)
  const sampleRate = audioContext.sampleRate;
  const duration = 0.05;
  const length = sampleRate * duration;
  shotBuffer = audioContext.createBuffer(1, length, sampleRate);
  const data = shotBuffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    // Simple sine wave at 440Hz, amplitude ~0.2
    data[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0.2;
  }
}

// Play our short beep each time we fire:
function playShotSound() {
  if (!shotBuffer) return;
  const source = audioContext.createBufferSource();
  source.buffer = shotBuffer;
  source.connect(audioContext.destination);
  source.start();
}

function onPointerLockChange() {
  isPointerLocked = document.pointerLockElement === document.body;
  if (!isPointerLocked) {
    // Reset movement flags when pointer lock is lost
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    isShooting = false;

    // Show message to click to re-enter
    if (!pointerLockMessage) {
      pointerLockMessage = document.createElement('div');
      pointerLockMessage.className = 'pointer-lock-message';
      pointerLockMessage.textContent = 'Click to re-enter game';
      document.body.appendChild(pointerLockMessage);
    }
  } else {
    // Remove message when pointer lock is regained
    if (pointerLockMessage) {
      pointerLockMessage.remove();
      pointerLockMessage = null;
    }
  }
}

function onPointerLockError() {
  console.error('Pointer lock error');
  // Attempt to re-lock the pointer
  if (gameActive) {
    document.body.requestPointerLock();
  }
}

// Add click handler for re-entering the game
document.addEventListener('click', function() {
  if (!isPointerLocked && gameActive) {
    document.body.requestPointerLock();
  }
}, false);

function createCharacter() {
  // Create character body (simple cylinder)
  const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4444ff,
    metalness: 0.5,
    roughness: 0.5
  });
  characterBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
  characterBody.position.y = 0.75; // Half the height of the body

  // Create character head (sphere)
  const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
  const headMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4444ff,
    metalness: 0.5,
    roughness: 0.5
  });
  characterHead = new THREE.Mesh(headGeometry, headMaterial);
  characterHead.position.y = 2.1; // Body height + half head height

  // Create character group
  character = new THREE.Group();
  character.add(characterBody);
  character.add(characterHead);
  character.position.set(0, 0, 0);
  scene.add(character);
}

function createHealthDisplay() {
  const healthDisplay = document.createElement('div');
  healthDisplay.className = 'health-display';
  healthDisplay.innerHTML = `
    <div class="health-bar player1">
      <div class="health-fill"></div>
      <span class="health-text">P1: 100%</span>
    </div>
    <div class="health-bar player2">
      <div class="health-fill"></div>
      <span class="health-text">P2: 100%</span>
    </div>
  `;
  document.body.appendChild(healthDisplay);
}

function updateHealthDisplay() {
  const player1Fill = document.querySelector('.health-bar.player1 .health-fill');
  const player2Fill = document.querySelector('.health-bar.player2 .health-fill');
  const player1Text = document.querySelector('.health-bar.player1 .health-text');
  const player2Text = document.querySelector('.health-bar.player2 .health-text');

  player1Fill.style.width = `${(player1Health / MAX_HEALTH) * 100}%`;
  player2Fill.style.width = `${(player2Health / MAX_HEALTH) * 100}%`;
  player1Text.textContent = `P1: ${Math.ceil(player1Health)}%`;
  player2Text.textContent = `P2: ${Math.ceil(player2Health)}%`;
}

function createPlayer(isPlayer1) {
  const player = new THREE.Group();
  
  // Create body
  const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: isPlayer1 ? 0x4444ff : 0xff4444,
    metalness: 0.5,
    roughness: 0.5
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.75;
  player.add(body);

  // Create head
  const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
  const headMaterial = new THREE.MeshStandardMaterial({ 
    color: isPlayer1 ? 0x4444ff : 0xff4444,
    metalness: 0.5,
    roughness: 0.5
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 2.1;
  player.add(head);

  // Set initial position
  if (isPlayer1) {
    player.position.set(-5, 0, 0);
  } else {
    player.position.set(5, 0, 0);
  }

  scene.add(player);
  return player;
}

function checkTargetHit() {
  raycaster.setFromCamera(new THREE.Vector2(), camera);
  const intersects = raycaster.intersectObject(target);
  if (intersects.length > 0) {
    shotsHit++;
    score += 100;
  }
  // Update accuracy regardless of hit or miss
  accuracy = shotsFired > 0 ? (shotsHit / shotsFired) * 100 : 0;
  document.querySelector('.score-display').textContent = 
    `Score: ${score} | Accuracy: ${accuracy.toFixed(1)}%`;

  // Start target movement and game timer on first shot
  if (!targetStartedMoving) {
    targetStartedMoving = true;
  }
  if (!gameStarted && gameMode !== 'free') {
    gameStarted = true;
  }
}

// Movement controls
function onKeyDown(event) {
  switch (event.code) {
    case 'KeyW':
      moveForward = true;
      break;
    case 'KeyS':
      moveBackward = true;
      break;
    case 'KeyA':
      moveLeft = true;
      break;
    case 'KeyD':
      moveRight = true;
      break;
    case 'Space':
      if (canJump) {
        jumpVelocity = JUMP_FORCE;
        canJump = false;
      }
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'KeyW':
      moveForward = false;
      break;
    case 'KeyS':
      moveBackward = false;
      break;
    case 'KeyA':
      moveLeft = false;
      break;
    case 'KeyD':
      moveRight = false;
      break;
  }
}

function getRandomDirection() {
  // Return a random angle in radians (0, 45, 90, 135, 180, 225, 270, 315 degrees)
  const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
  return angles[Math.floor(Math.random() * angles.length)];
}

// Update the initWorld function to fix the black screen issue
function initWorld() {
    // Clear any existing scene
    if (scene) {
        scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                object.material.dispose();
            }
        });
        scene.clear();
    }

    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    
    // Make sure the container exists and is empty
    let container = document.getElementById('world-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'world-container';
        document.body.appendChild(container);
    } else {
        container.innerHTML = ''; // Clear any existing content
    }
    container.appendChild(renderer.domElement);

    // Add controls with updated sensitivity
    controls = new THREE.PointerLockControls(camera, document.body);
    controls.mouseSensitivity = MOUSE_SENSITIVITY * mouseSensitivity;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        map: createCheckerboardTexture(4, 8),
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create walls
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        map: createCheckerboardTexture(4, 8),
        roughness: 0.8,
        metalness: 0.2
    });

    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 20),
        wallMaterial
    );
    backWall.position.z = -50;
    backWall.position.y = 10;
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 20),
        wallMaterial
    );
    frontWall.position.z = 50;
    frontWall.position.y = 10;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 20),
        wallMaterial
    );
    leftWall.position.x = -50;
    leftWall.position.y = 10;
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 20),
        wallMaterial
    );
    rightWall.position.x = 50;
    rightWall.position.y = 10;
    rightWall.rotation.y = Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Create players or target based on game type
    if (gameType === 'pvp' && socket) {
        // Remove existing players if any
        if (player1) scene.remove(player1);
        if (player2) scene.remove(player2);
        if (otherPlayer) scene.remove(otherPlayer);

        // Create new players
        player1 = createPlayer(true);
        player2 = createPlayer(false);
        createHealthDisplay();
        updateHealthDisplay();

        // Position camera based on player number
        if (playerNumber === 1) {
            camera.position.set(-5, 2, 0);
            camera.lookAt(0, 2, 0);
        } else {
            camera.position.set(5, 2, 0);
            camera.lookAt(0, 2, 0);
        }
    } else {
        // Single player mode
        createTarget();
        camera.position.set(0, 2, 15);
        camera.lookAt(0, TARGET_HEIGHT, 0);
    }

    // Create character
    createCharacter();

    // Add UI elements
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    document.body.appendChild(crosshair);

    const scoreDisplay = document.createElement('div');
    scoreDisplay.className = 'score-display';
    scoreDisplay.textContent = 'Score: 0 | Accuracy: 0%';
    document.body.appendChild(scoreDisplay);

    if (gameMode !== 'free') {
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'time-display';
        timeDisplay.textContent = `Time: ${gameMode}s`;
        document.body.appendChild(timeDisplay);
    }

    // Reset game state
    score = 0;
    shotsFired = 0;
    shotsHit = 0;
    accuracy = 0;
    gameTime = gameMode === 'free' ? Infinity : gameMode;
    gameStarted = false;
    targetStartedMoving = false;
    player1Health = MAX_HEALTH;
    player2Health = MAX_HEALTH;
    player1Dead = false;
    player2Dead = false;

    // Add game event listeners
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Add pointer lock event listeners
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    // Start animation loop
    animate(0);
}

function checkPlayerHit() {
  if (gameType !== 'pvp') return;

  raycaster.setFromCamera(new THREE.Vector2(), camera);
  const intersects = raycaster.intersectObjects([player1, player2]);

  for (const intersect of intersects) {
    if (intersect.object.parent === player1 && !player1Dead) {
      socket.emit('playerShot', socket.id);
    } else if (intersect.object.parent === player2 && !player2Dead) {
      socket.emit('playerShot', socket.id);
    }
  }
}
