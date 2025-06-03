# backend/Dockerfile
FROM node:20-alpine # Start building from a lean (alpine) Node.js image, which is like a ready-made mini-computer with Node.js installed.
WORKDIR /app # Set the working directory inside this mini-computer to /app. All future commands will run from here.
COPY package*.json ./ # Copy the 'package.json' and 'package-lock.json' files from your computer to the /app folder in the mini-computer.
RUN npm install # Install all the project dependencies listed in package.json. This creates the 'node_modules' folder inside the mini-computer.
COPY . . # Copy all remaining files from your current 'backend' folder into the /app folder in the mini-computer.
EXPOSE 3001 # Tell the outside world that this mini-computer service will listen for connections on port 3001.
CMD ["npm", "start"] # This is the command that will run automatically when the service starts, launching your Node.js application.
