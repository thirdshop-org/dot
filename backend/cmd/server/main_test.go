package main

import (
	"fmt"
	"testing"

	"github.com/vaultdrop/backend/models"
)

func TestUserCreation(t *testing.T) {

	err, userAntoine := models.NewUser("antoine")
	if err != nil {
		t.Errorf(`Error creating antoine user %v`, err)
	}

	err, userBob := models.NewUser("bob")
	if err != nil {
		t.Errorf(`Error creating bob user %v`, err)
	}

	fmt.Println(userAntoine, userBob)

}

func TestCreateDocument(t *testing.T) {

	err, document := models.NewDocument("paper.pdf", models.FILE, 1)
	if err != nil {
		t.Errorf(`Error creating document %v`, err)
	}

	err, directory := models.NewDocument("bob", models.DIRECTORY, 1)
	if err != nil {
		t.Errorf(`Error creating bob directory %v`, err)
	}

	fmt.Println(document, directory)

}