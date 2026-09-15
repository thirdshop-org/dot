package main

import (
	"fmt"
	"testing"

	"github.com/vaultdrop/backend/models"
)

func TestUserCreation(t *testing.T) {

	userAntoine, err := models.NewUser("antoine")
	if err != nil {
		t.Fatalf("creating antoine user: %v", err)
	}

	userBob, err := models.NewUser("bob")
	if err != nil {
		t.Fatalf("creating bob user: %v", err)
	}

	fmt.Println(userAntoine, userBob)

}

func TestCreateDocument(t *testing.T) {

	document, err := models.NewDocument("paper.pdf", models.FILE, 1)
	if err != nil {
		t.Fatalf("creating document: %v", err)
	}

	directory, err := models.NewDocument("bob", models.DIRECTORY, 1)
	if err != nil {
		t.Fatalf("creating bob directory: %v", err)
	}

	fmt.Println(document, directory)

}