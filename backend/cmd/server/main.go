package main

import (
	"log"

	"github.com/vaultdrop/backend/config"
)

func main() {

	err, _ := config.LoadApplicationConfig()

	if err != nil {
		log.Fatalln(err)
	}

}
