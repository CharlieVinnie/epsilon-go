package main

import (
	"fmt"
	"syscall/js"
)

const (
	Empty = 0
	Black = 1 // User
	White = 2 // Bot
)

var (
	size  int
	board [][]int
)

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("startGame", js.FuncOf(startGame))
	// js.Global().Set("humanMove", js.FuncOf(humanMove)) // Deprecated
	js.Global().Set("resolveHumanMove", js.FuncOf(resolveHumanMove))
	js.Global().Set("resolveBotMove", js.FuncOf(resolveBotMove))
	fmt.Println("Go Bot WASM Initialized")
	<-c
}

func startGame(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return "Error: arguments missing (size, userColor)"
	}
	size = args[0].Int()
	userColor := args[1].Int() // 1=Black, 2=White

	board = make([][]int, size)
	for i := range board {
		board[i] = make([]int, size)
	}

	// If User is White (2), Bot is Black (1) and plays first.
	if userColor == White {
		botMoveX, botMoveY := findBotMove(Black)
		if botMoveX != -1 {
			playMove(botMoveX, botMoveY, Black)
		}
	}

	return map[string]interface{}{
		"board": flattenBoard(),
	}
}

func humanMove(this js.Value, args []js.Value) interface{} {
	// Deprecated: logic split into resolveHumanMove and resolveBotMove
	return nil
}

func resolveHumanMove(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return map[string]interface{}{"error": "missing arguments (x, y, userColor)"}
	}
	x := args[0].Int()
	y := args[1].Int()
	userColor := args[2].Int()
	botColor := 3 - userColor

	// 1. Validate Human Move
	if !isLegal(x, y, userColor) {
		return map[string]interface{}{"valid": false}
	}

	// 2. Play Human Move
	playMove(x, y, userColor)

	// 3. Check Game Over (if bot has no moves)
	botMoveX, _ := findBotMove(botColor)
	if botMoveX == -1 {
		winner := "Black"
		if userColor == Black {
			winner = "Black (User)"
		} else {
			winner = "Black (Bot)" // Should not happen if userColor is Black
		}
		// If user is Black, Bot is White. If Bot has no moves, User Wins (Black).

		if userColor == White {
			winner = "White (User)"
		}
		
		return map[string]interface{}{
			"valid":      true,
			"board":      flattenBoard(),
			"winner":     winner, 
			"gameOver":   true,
		}
	}

	return map[string]interface{}{
		"valid":   true,
		"board":   flattenBoard(),
		"botTurn": true, // Signal to frontend to trigger bot move
	}
}

func resolveBotMove(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return map[string]interface{}{"error": "missing arguments (userColor)"}
	}
	userColor := args[0].Int()
	botColor := 3 - userColor

	botMoveX, botMoveY := findBotMove(botColor)
	// This check should generally pass because resolveHumanMove checked it, 
	// but good to be safe.
	if botMoveX == -1 {
         // Should have been caught in resolveHumanMove, but handle gracefully
		return map[string]interface{}{
			"gameOver": true,
            "winner": "User", // Simplification
		}
	}

	// 4. Play Bot Move
	playMove(botMoveX, botMoveY, botColor)

	// 5. Check Game Over (if human has no moves)
	humanCanMove := hasLegalMove(userColor)

	res := map[string]interface{}{
		"board":    flattenBoard(),
		"gameOver": !humanCanMove,
	}
	
	if !humanCanMove {
		// Human has no move -> Human loses -> Bot wins
		if botColor == Black {
			res["winner"] = "Black (Bot)"
		} else {
			res["winner"] = "White (Bot)"
		}
	}

	return res
}

func findBotMove(color int) (int, int) {
	for r := 0; r < size; r++ {
		for c := 0; c < size; c++ {
			if isLegal(r, c, color) {
				return r, c
			}
		}
	}
	return -1, -1
}

func playMove(r, c, color int) {
	board[r][c] = color
	removeDeadGroups(3 - color) 
}

func isLegal(r, c, color int) bool {
	if r < 0 || r >= size || c < 0 || c >= size {
		return false
	}
	if board[r][c] != Empty {
		return false
	}

	// Temporarily play the move
	board[r][c] = color
	
	// Check for capture of opponent
	opponent := 3 - color
	captured := false
	
	neighbors := [][2]int{{r - 1, c}, {r + 1, c}, {r, c - 1}, {r, c + 1}}
	for _, n := range neighbors {
		nr, nc := n[0], n[1]
		if nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] == opponent {
			if countLiberties(nr, nc) == 0 {
				captured = true
				break
			}
		}
	}

	// Check for suicide
	liberties := countLiberties(r, c)
	isSuicide := liberties == 0
	
	// Revert
	board[r][c] = Empty

	if isSuicide && !captured {
		return false
	}

	return true
}

func removeDeadGroups(color int) {
	visited := make([][]bool, size)
	for i := range visited {
		visited[i] = make([]bool, size)
	}

	deadStones := make([][2]int, 0)

	for r := 0; r < size; r++ {
		for c := 0; c < size; c++ {
			if board[r][c] == color && !visited[r][c] {
				group, libs := getGroupAndLiberties(r, c, visited)
				if libs == 0 {
					deadStones = append(deadStones, group...)
				}
			}
		}
	}

	for _, s := range deadStones {
		board[s[0]][s[1]] = Empty
	}
}

func countLiberties(r, c int) int {
	// Need a fresh visited array for counting liberties of a specific group safely
	// because getGroupAndLiberties mutates visited
	visited := make([][]bool, size)
	for i := range visited {
		visited[i] = make([]bool, size)
	}
	_, libs := getGroupAndLiberties(r, c, visited)
	return libs
}

func getGroupAndLiberties(r, c int, visited [][]bool) ([][2]int, int) {
	color := board[r][c]
	// DFS/BFS
	stack := [][2]int{{r, c}}
	group := [][2]int{}
	var liberties int = 0
	visited[r][c] = true
	
	// Use a map to count unique liberty coordinates
	seenLiberties := make(map[string]bool)

	for len(stack) > 0 {
		curr := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		cr, cc := curr[0], curr[1]
		group = append(group, curr)

		neighbors := [][2]int{{cr - 1, cc}, {cr + 1, cc}, {cr, cc - 1}, {cr, cc + 1}}
		for _, n := range neighbors {
			nr, nc := n[0], n[1]
			if nr < 0 || nr >= size || nc < 0 || nc >= size {
				continue
			}
			if board[nr][nc] == Empty {
				key := fmt.Sprintf("%d,%d", nr, nc)
				if !seenLiberties[key] {
					seenLiberties[key] = true
					liberties++
				}
			} else if board[nr][nc] == color && !visited[nr][nc] {
				visited[nr][nc] = true
				stack = append(stack, [2]int{nr, nc})
			}
		}
	}
	return group, liberties
}

func hasLegalMove(color int) bool {
	for r := 0; r < size; r++ {
		for c := 0; c < size; c++ {
			if isLegal(r, c, color) {
				return true
			}
		}
	}
	return false
}

func flattenBoard() []interface{} {
	flat := make([]interface{}, size*size)
	for r := 0; r < size; r++ {
		for c := 0; c < size; c++ {
			flat[r*size+c] = board[r][c]
		}
	}
	return flat
}
