ALTER TABLE resource_tags DROP CONSTRAINT resource_tags_resource_id_fkey,
    ADD CONSTRAINT resource_tags_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id);
