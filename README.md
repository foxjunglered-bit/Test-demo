# Test-demo — Le refuge du lac

Démo Three.js, publiée sur https://test-demo-six-opal.vercel.app.

## V14

La voiture procédurale de la V13 est remplacée par le modèle fourni `1000025324.glb`, dans `assets/car-v14.glb`. La cabane, le terrain, le personnage et les commandes restent ceux de la V13.

- 81 758 triangles (original : 192 220), 2 337 052 octets (original : 9 365 656).
- Deux textures WebP de 2048 × 2048 conservées sans réencodage.
- Simplification meshoptimizer avec un seuil d'erreur de 0,002, puis compression Meshopt.
- Longueur dans la scène : 4,66 m. Placement centré, ajusté à la pente du parking.
- Chargement asynchrone avec message de progression et bouton de nouvelle tentative en cas d'échec.
- Three.js 0.169.0 et le décodeur Meshopt sont servis depuis `vendor/` ; leurs licences sont incluses. Aucun service payant ou abonnement ajouté.

Contrôles : joystick à gauche pour marcher, glisser sur la scène pour regarder ; clavier ZQSD/WASD ou flèches.

Validation : syntaxe JavaScript, validation glTF (aucune erreur ni alerte ; extension Meshopt vérifiée séparément), décodage par GLTFLoader et MeshoptDecoder, décodage des textures et dimensions vérifiés. Le navigateur de contrôle ne dispose pas de WebGL ; rendu visuel et performances sur téléphone restent à vérifier sur un appareil compatible.
