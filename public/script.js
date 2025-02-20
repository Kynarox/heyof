const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
class Checkers {
    constructor() {
        this.board = Array(8).fill().map(() => Array(8).fill(null));
        this.selectedPiece = null;
        this.currentPlayer = 'red';
        this.validMoves = [];
        this.setupPieces();
    }

    setupPieces() {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    if (row < 3) this.board[row][col] = { color: 'black', king: false };
                    if (row > 4) this.board[row][col] = { color: 'red', king: false };
                }
            }
        }
    }

    getValidMoves(row, col) {
        const moves = [];
        const piece = this.board[row][col];
        if (!piece) return moves;

        const directions = piece.king ? [-1, 1] : piece.color === 'red' ? [-1] : [1];
        
        directions.forEach(direction => {
            [-1, 1].forEach(side => {
                const newRow = row + direction;
                const newCol = col + side;
                if (this.isValidPosition(newRow, newCol) && !this.board[newRow][newCol]) {
                    moves.push({ row: newRow, col: newCol, jump: false });
                }

                const jumpRow = row + (direction * 2);
                const jumpCol = col + (side * 2);
                const midRow = row + direction;
                const midCol = col + side;
                if (this.isValidPosition(jumpRow, jumpCol) && 
                    !this.board[jumpRow][jumpCol] &&
                    this.board[midRow][midCol] &&
                    this.board[midRow][midCol].color !== piece.color) {
                    moves.push({ row: jumpRow, col: jumpCol, jump: true });
                }
            });
        });
        return moves;
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        if ((piece.color === 'red' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
            piece.king = true;
        }

        if (Math.abs(toRow - fromRow) === 2) {
            this.board[(fromRow + toRow)/2][(fromCol + toCol)/2] = null;
        }

        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
    }

    checkWinner() {
        const counts = { red: 0, black: 0 };
        this.board.forEach(row => row.forEach(piece => {
            if (piece) counts[piece.color]++;
        }));
        return counts.red === 0 ? 'black' : counts.black === 0 ? 'red' : null;
    }
}

class GameController {
    constructor() {
        this.game = new Checkers();
        this.difficulty = 'medium';
        this.initDOM();
        this.setupDifficultySelector();
        this.addEventListeners();
        this.updateStatus();
    }

    initDOM() {
        this.boardElement = document.getElementById('game-board');
        this.statusElement = document.getElementById('status');
        this.loadingElement = document.getElementById('loading');
        this.renderBoard();
    }

    renderBoard() {
        this.boardElement.innerHTML = '';
        this.game.board.forEach((row, rowIndex) => {
            row.forEach((piece, colIndex) => {
                const square = document.createElement('div');
                square.className = `square ${(rowIndex + colIndex) % 2 ? 'black' : 'white'}`;
                square.dataset.row = rowIndex;
                square.dataset.col = colIndex;

                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.className = `piece ${piece.color}-piece${piece.king ? ' king' : ''}`;
                    square.appendChild(pieceElement);
                }

                square.addEventListener('click', (e) => this.handleSquareClick(e));
                this.boardElement.appendChild(square);
            });
        });
    }

    handleSquareClick(event) {
        if (this.game.currentPlayer !== 'red') return;

        const square = event.target.closest('.square');
        if (!square) return;

        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        if (this.game.selectedPiece) {
            this.handleMove(row, col);
        } else {
            this.handleSelection(row, col);
        }
    }

    handleSelection(row, col) {
        const piece = this.game.board[row][col];
        if (piece?.color === 'red') {
            this.game.selectedPiece = { row, col };
            this.game.validMoves = this.game.getValidMoves(row, col);
            this.highlightMoves();
        }
    }

    handleMove(row, col) {
        if (this.isValidMove(row, col)) {
            this.executeMove(row, col);
            this.checkGameStatus();
            if (this.game.currentPlayer === 'black') {
                this.makeAIMove();
            }
        }
        this.clearSelection();
    }

    async makeAIMove() {
        this.loadingElement.style.display = 'block';
        try {
            let aiMove;
            switch(this.difficulty) {
                case 'hard':
                    aiMove = await this.getGeminiAIMove();
                    break;
                case 'medium':
                    aiMove = this.getStrategicAIMove();
                    break;
                default:
                    aiMove = this.getRandomAIMove();
            }

            if (aiMove) {
                this.executeAIMove(aiMove);
            }
        } catch (error) {
            console.error('AI Error:', error);
            this.makeRandomAIMove();
        } finally {
            this.loadingElement.style.display = 'none';
        }
    }

    async getGeminiAIMove() {
        try {
            const boardState = this.game.board.map(row => 
                row.map(piece => piece ? `${piece.color}${piece.king ? '-king' : ''}` : null)
            );
            
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `As expert checkers AI, suggest best black move. Valid moves: ${JSON.stringify(this.getAllValidAIMoves())}. Board:
${JSON.stringify(boardState)}
Respond ONLY with JSON: {"from": {"row": X, "col": Y}, "to": {"row": X, "col": Y}}`
                        }]
                    }]
                })
            });

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            const jsonMatch = text.match(/\{.*\}/s);
            const move = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            return this.validateAIMove(move) ? move : this.getStrategicAIMove();
        } catch {
            return this.getStrategicAIMove();
        }
    }

    getStrategicAIMove() {
        const allMoves = this.getAllValidAIMoves();
        const jumps = allMoves.filter(move => 
            Math.abs(move.from.row - move.to.row) === 2
        );

        if (jumps.length > 0) return jumps[Math.floor(Math.random() * jumps.length)];

        const kingMoves = allMoves.filter(move => 
            this.game.board[move.from.row][move.from.col].king
        );

        if (kingMoves.length > 0) {
            return kingMoves.reduce((best, current) => 
                this.scoreMove(current) > this.scoreMove(best) ? current : best
            , kingMoves[0]);
        }

        return this.getRandomAIMove();
    }

    scoreMove(move) {
        const piece = this.game.board[move.from.row][move.from.col];
        let score = 0;
        
        // Progress towards kinging
        if (!piece.king) score += (7 - move.to.row) * 2;
        
        // Center control
        score += 3 - Math.abs(3.5 - move.to.col);
        
        // Capture priority
        if (Math.abs(move.to.row - move.from.row) === 2) score += 10;
        
        // Protect king
        if (piece.king) score += 5 - Math.abs(3.5 - move.to.row);
        
        return score;
    }

    getRandomAIMove() {
        const moves = this.getAllValidAIMoves();
        return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
    }

    getAllValidAIMoves() {
        const moves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.game.board[row][col]?.color === 'black') {
                    this.game.getValidMoves(row, col).forEach(move => {
                        moves.push({
                            from: { row, col },
                            to: { row: move.row, col: move.col }
                        });
                    });
                }
            }
        }
        return moves;
    }

    validateAIMove(move) {
        try {
            return this.game.getValidMoves(move.from.row, move.from.col)
                .some(m => m.row === move.to.row && m.col === move.to.col);
        } catch {
            return false;
        }
    }

    executeAIMove(aiMove) {
        this.game.movePiece(aiMove.from.row, aiMove.from.col, aiMove.to.row, aiMove.to.col);
        this.renderBoard();
        this.updateStatus();
        this.checkGameStatus();
        this.game.currentPlayer = 'red';
    }

    setupDifficultySelector() {
        const difficultySelect = document.getElementById('difficulty');
        difficultySelect.addEventListener('change', (e) => {
            this.difficulty = e.target.value;
            this.newGame();
        });
    }

    isValidMove(row, col) {
        return this.game.validMoves.some(m => m.row === row && m.col === col);
    }

    executeMove(row, col) {
        this.game.movePiece(this.game.selectedPiece.row, this.game.selectedPiece.col, row, col);
        this.renderBoard();
        this.updateStatus();
    }

    checkGameStatus() {
        const winner = this.game.checkWinner();
        if (winner) {
            alert(`${winner.toUpperCase()} wins!`);
            this.newGame();
        }
    }

    highlightMoves() {
        document.querySelectorAll('.square').forEach(square => {
            square.classList.remove('selected', 'valid-move');
        });

        if (this.game.selectedPiece) {
            const selectedSquare = document.querySelector(
                `[data-row="${this.game.selectedPiece.row}"][data-col="${this.game.selectedPiece.col}"]`
            );
            selectedSquare?.classList.add('selected');
        }

        this.game.validMoves.forEach(move => {
            document.querySelector(
                `[data-row="${move.row}"][data-col="${move.col}"]`
            )?.classList.add('valid-move');
        });
    }

    clearSelection() {
        this.game.selectedPiece = null;
        this.game.validMoves = [];
        this.highlightMoves();
    }

    newGame() {
        this.game = new Checkers();
        this.renderBoard();
        this.updateStatus();
    }

    updateStatus() {
        this.statusElement.textContent = `Current Player: ${this.game.currentPlayer.toUpperCase()} | Difficulty: ${this.difficulty.toUpperCase()}`;
    }

    addEventListeners() {
        document.getElementById('newGame').addEventListener('click', () => this.newGame());
    }
}

new GameController();